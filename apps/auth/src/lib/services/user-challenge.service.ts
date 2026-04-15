import type { UserRepository, UserWithPassword } from "@/lib/repositories/admin.repository";
import type { UserChallengeRepository } from "@/lib/repositories/user-challenge.repository";
import type { SiteSettingsRepository } from "@/lib/repositories/site-settings.repository";
import { getAuthSecret } from "@/lib/auth/auth-secret";
import { hashPassword, verifyPassword } from "@/lib/auth/password-hash";
import {
	signPasswordResetJwt,
	verifyPasswordResetJwt,
	PASSWORD_RESET_JWT_TTL_SECONDS,
} from "@/lib/auth/password-reset-jwt";
import { resolveIssuerBaseUrl } from "@/lib/config/issuer-base-url";
import { resolveHashMethod } from "@/lib/config/hash-method";
import { resolveMfaOtpMaxAttempts } from "@/lib/config/mfa-otp-max-attempts";
import { timingSafeEqualHex } from "@/lib/crypto/hmac-sha256";
import {
	buildTransactionalEmailHtml,
	emailVerificationBodyHtml,
	mfaOtpBodyHtml,
	passwordResetBodyHtml,
} from "@/lib/email/transactional-html";
import { TransactionalEmailService } from "./transactional-email.service";
import { SiteSettingsService } from "./site-settings.service";

const MFA_OTP_TTL_MS = 10 * 60 * 1000;
const EMAIL_VERIFICATION_TTL_MS = 10 * 60 * 1000;

export type MfaOtpFailureReason =
	| "challenge_missing_or_mismatch"
	| "challenge_consumed"
	| "challenge_expired"
	| "otp_incorrect"
	| "otp_max_attempts_exceeded";

export type MfaOtpVerifyResult = { ok: true } | { ok: false; reason: MfaOtpFailureReason };

export type EmailVerificationFailureReason =
	| "challenge_missing_or_mismatch"
	| "challenge_consumed"
	| "challenge_expired"
	| "otp_incorrect"
	| "otp_max_attempts_exceeded";

export type EmailVerificationVerifyResult =
	| { ok: true }
	| { ok: false; reason: EmailVerificationFailureReason };

export interface UserChallengeServiceMail {
	getResendApiKey(): string | null;
	fromAddress(siteUrlHttp: string): string;
	send(params: {
		from: string;
		to: string;
		subject: string;
		html: string;
		text?: string;
	}): Promise<void>;
}

export interface UserChallengeServiceSiteSettings {
	getEmailLogoAbsoluteUrl(logoKey: string | null, cdnUrlOverride: string | null): string;
	getDisplaySiteTitle(siteTitle: string | null | undefined): string;
}

export interface UserChallengeServiceDeps {
	userRepo: UserRepository;
	challengeRepo: UserChallengeRepository;
	siteRepo: SiteSettingsRepository;
	siteSettings: UserChallengeServiceSiteSettings;
	mail: UserChallengeServiceMail;
	env: CloudflareEnv;
}

function maskEmailForLogs(email: string): string {
	const trimmed = email.trim().toLowerCase();
	const at = trimmed.indexOf("@");
	if (at <= 0 || at === trimmed.length - 1) {
		return "invalid_email";
	}
	const local = trimmed.slice(0, at);
	const domain = trimmed.slice(at + 1);
	const visibleLocal = local.length <= 2 ? `${local[0] ?? ""}*` : `${local.slice(0, 2)}***`;
	return `${visibleLocal}@${domain}`;
}

function logPasswordReset(payload: Record<string, unknown>): void {
	console.info(JSON.stringify({ event: "password_reset", ...payload }));
}

function logEmailVerification(payload: Record<string, unknown>): void {
	console.info(JSON.stringify({ event: "email_verification", ...payload }));
}

function randomSixDigitCode(): string {
	const buf = new Uint32Array(1);
	crypto.getRandomValues(buf);
	return String(100000 + (buf[0] % 900000));
}

async function hashMfaOtp(challengeId: string, code: string): Promise<string> {
	const raw = `${challengeId}:${code}:${getAuthSecret()}`;
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type EmailChallengeUser = Pick<
	UserWithPassword,
	"id" | "username" | "name" | "email" | "emailVerifiedAt" | "avatarKey" | "isAdmin"
>;

export class UserChallengeService {
	private readonly userRepo: UserRepository;
	private readonly challengeRepo: UserChallengeRepository;
	private readonly siteRepo: SiteSettingsRepository;
	private readonly siteSettings: UserChallengeServiceSiteSettings;
	private readonly mail: UserChallengeServiceMail;
	private readonly env: Record<string, unknown>;
	private readonly cfEnv: CloudflareEnv;

	constructor({ userRepo, challengeRepo, siteRepo, siteSettings, mail, env }: UserChallengeServiceDeps) {
		this.userRepo = userRepo;
		this.challengeRepo = challengeRepo;
		this.siteRepo = siteRepo;
		this.siteSettings = siteSettings;
		this.mail = mail;
		this.cfEnv = env;
		this.env = env as unknown as Record<string, unknown>;
	}

	async verifyUsernamePassword(username: string, password: string): Promise<UserWithPassword | null> {
		const user = await this.userRepo.findByUsername(username.trim());
		if (!user) return null;
		const v = await verifyPassword(password, user.passwordHash, {
			argonHasher: this.cfEnv.ARGON_HASHER,
			hashMethod: resolveHashMethod(this.env),
		});
		if (!v.ok) return null;
		if (v.rehash) {
			await this.userRepo.update(user.id, { passwordHash: v.rehash });
			user.passwordHash = v.rehash;
		}
		return user;
	}

	async createMfaOtpAndSendEmail(user: UserWithPassword): Promise<string> {
		const site = await this.siteRepo.get();
		const siteUrl = site?.siteUrl?.trim();
		if (!siteUrl) {
			throw new Error("Site URL is not configured.");
		}
		if (!user.email?.trim()) {
			throw new Error("Your account has no email address; MFA cannot be used.");
		}
		const code = randomSixDigitCode();
		const challengeId = crypto.randomUUID();
		const now = new Date();
		const expiresAt = new Date(now.getTime() + MFA_OTP_TTL_MS);
		const codeHash = await hashMfaOtp(challengeId, code);

		await this.challengeRepo.insert({
			id: challengeId,
			userId: user.id,
			kind: "mfa_otp",
			codeHash,
			expiresAt: expiresAt.toISOString(),
			createdAt: now.toISOString(),
		});

		const displayTitle = site?.siteTitle?.trim() || "Sign in";
		const siteUrlHttp = siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`;
		const logoUrl = this.siteSettings.getEmailLogoAbsoluteUrl(
			site?.logoKey ?? null,
			site?.cdnUrl ?? null
		);
		const logoAlt = this.siteSettings.getDisplaySiteTitle(site?.siteTitle);

		const from = this.mail.fromAddress(siteUrlHttp);
		const html = buildTransactionalEmailHtml({
			heading: displayTitle,
			logoUrl,
			logoAlt,
			bodyHtml: mfaOtpBodyHtml(code),
			footerLine: `Sent by ${logoAlt}. If you did not try to sign in, you can ignore this email.`,
		});

		await this.mail.send({
			from,
			to: user.email.trim(),
			subject: `Your sign-in code — ${displayTitle}`,
			html,
			text: `Your verification code is: ${code} (expires in 10 minutes).`,
		});

		return challengeId;
	}

	async createEmailVerificationOtpAndSendEmail(user: EmailChallengeUser): Promise<string> {
		const site = await this.siteRepo.get();
		const siteUrl = site?.siteUrl?.trim();
		if (!siteUrl) {
			throw new Error("Site URL is not configured.");
		}
		if (!user.email?.trim()) {
			throw new Error("Your account has no email address; email verification cannot be used.");
		}

		await this.challengeRepo.deleteByUserIdAndKind(user.id, "email_verification");

		const code = randomSixDigitCode();
		const challengeId = crypto.randomUUID();
		const now = new Date();
		const expiresAt = new Date(now.getTime() + EMAIL_VERIFICATION_TTL_MS);
		const codeHash = await hashMfaOtp(challengeId, code);

		await this.challengeRepo.insert({
			id: challengeId,
			userId: user.id,
			kind: "email_verification",
			codeHash,
			expiresAt: expiresAt.toISOString(),
			createdAt: now.toISOString(),
		});

		const displayTitle = site?.siteTitle?.trim() || "Verify your email";
		const siteUrlHttp = siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`;
		const logoUrl = this.siteSettings.getEmailLogoAbsoluteUrl(
			site?.logoKey ?? null,
			site?.cdnUrl ?? null
		);
		const logoAlt = this.siteSettings.getDisplaySiteTitle(site?.siteTitle);

		const from = this.mail.fromAddress(siteUrlHttp);
		const html = buildTransactionalEmailHtml({
			heading: displayTitle,
			logoUrl,
			logoAlt,
			bodyHtml: emailVerificationBodyHtml(code),
			footerLine: `Sent by ${logoAlt}. If you did not request this verification email, you can ignore it.`,
		});

		await this.mail.send({
			from,
			to: user.email.trim(),
			subject: `Verify your email — ${displayTitle}`,
			html,
			text: `Your email verification code is: ${code} (expires in 10 minutes).`,
		});

		logEmailVerification({ step: "challenge_created", userId: user.id, challengeId });
		return challengeId;
	}

	async verifyMfaOtpAndConsume(
		challengeId: string,
		userId: string,
		code: string
	): Promise<MfaOtpVerifyResult> {
		const row = await this.challengeRepo.getById(challengeId);
		if (!row || row.kind !== "mfa_otp" || row.userId !== userId) {
			return { ok: false, reason: "challenge_missing_or_mismatch" };
		}
		if (row.consumedAt) {
			return { ok: false, reason: "challenge_consumed" };
		}
		if (row.expiresAt <= new Date().toISOString()) {
			await this.challengeRepo.deleteById(challengeId);
			return { ok: false, reason: "challenge_expired" };
		}
		const expected = await hashMfaOtp(challengeId, code.trim());
		if (!timingSafeEqualHex(expected, row.codeHash ?? "")) {
			const maxAttempts = resolveMfaOtpMaxAttempts(this.env);
			const newCount = await this.challengeRepo.incrementOtpFailedAttempts(challengeId);
			if (newCount != null && newCount >= maxAttempts) {
				await this.challengeRepo.deleteById(challengeId);
				return { ok: false, reason: "otp_max_attempts_exceeded" };
			}
			return { ok: false, reason: "otp_incorrect" };
		}
		await this.challengeRepo.deleteById(challengeId);
		return { ok: true };
	}

	async verifyEmailVerificationOtpAndConsume(
		challengeId: string,
		userId: string,
		code: string
	): Promise<EmailVerificationVerifyResult> {
		const row = await this.challengeRepo.getById(challengeId);
		if (!row || row.kind !== "email_verification" || row.userId !== userId) {
			return { ok: false, reason: "challenge_missing_or_mismatch" };
		}
		if (row.consumedAt) {
			return { ok: false, reason: "challenge_consumed" };
		}
		if (row.expiresAt <= new Date().toISOString()) {
			await this.challengeRepo.deleteById(challengeId);
			return { ok: false, reason: "challenge_expired" };
		}
		const expected = await hashMfaOtp(challengeId, code.trim());
		if (!timingSafeEqualHex(expected, row.codeHash ?? "")) {
			const maxAttempts = resolveMfaOtpMaxAttempts(this.env);
			const newCount = await this.challengeRepo.incrementOtpFailedAttempts(challengeId);
			if (newCount != null && newCount >= maxAttempts) {
				await this.challengeRepo.deleteById(challengeId);
				return { ok: false, reason: "otp_max_attempts_exceeded" };
			}
			return { ok: false, reason: "otp_incorrect" };
		}
		await this.challengeRepo.deleteById(challengeId);
		await this.markEmailVerified(userId);
		logEmailVerification({ step: "challenge_verified", userId, challengeId });
		return { ok: true };
	}

	async markEmailVerified(userId: string): Promise<void> {
		const user = await this.userRepo.getById(userId);
		if (!user || user.isAdmin || !user.email?.trim() || user.emailVerifiedAt) {
			return;
		}
		await this.userRepo.update(userId, { emailVerifiedAt: new Date().toISOString() });
	}

	async requestEmailVerification(userId: string): Promise<string | null> {
		const targetUser = await this.userRepo.getById(userId);
		if (!targetUser) {
			throw new Error("User not found");
		}
		if (targetUser.isAdmin) {
			return null;
		}
		if (!targetUser.email?.trim()) {
			throw new Error("Your account has no email address; email verification cannot be used.");
		}
		if (targetUser.emailVerifiedAt) {
			return null;
		}
		return this.createEmailVerificationOtpAndSendEmail(targetUser);
	}

	/**
	 * Always completes without revealing whether the email exists.
	 */
	async requestPasswordReset(emailRaw: string): Promise<void> {
		const email = emailRaw.trim().toLowerCase();
		const emailMasked = maskEmailForLogs(email);
		logPasswordReset({ step: "request_start", emailMasked });
		const genericDone = async () => {
			await Promise.resolve();
		};
		if (!email) {
			logPasswordReset({ step: "request_ignored", reason: "empty_email" });
			await genericDone();
			return;
		}

		const user = await this.userRepo.findByEmail(email);
		if (!user?.email?.trim()) {
			logPasswordReset({ step: "request_lookup", outcome: "no_matching_user", emailMasked });
			await genericDone();
			return;
		}

		const site = await this.siteRepo.get();
		const siteUrl = site?.siteUrl?.trim();
		if (!siteUrl || !this.mail.getResendApiKey()) {
			logPasswordReset({
				step: "request_skipped",
				reason: !siteUrl ? "missing_site_url" : "missing_resend_api_key",
				emailMasked,
				userId: user.id,
			});
			await genericDone();
			return;
		}

		const base = resolveIssuerBaseUrl(this.env);
		const siteUrlHttp = siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`;

		const challengeId = crypto.randomUUID();
		const now = new Date();
		const expiresAt = new Date(now.getTime() + PASSWORD_RESET_JWT_TTL_SECONDS * 1000);

		await this.challengeRepo.insert({
			id: challengeId,
			userId: user.id,
			kind: "password_reset",
			codeHash: null,
			expiresAt: expiresAt.toISOString(),
			createdAt: now.toISOString(),
		});

		const token = await signPasswordResetJwt(this.env, {
			challengeId,
			userId: user.id,
			expiresAt,
		});
		logPasswordReset({
			step: "challenge_created",
			userId: user.id,
			challengeId,
			emailMasked,
			expiresAt: expiresAt.toISOString(),
		});

		const resetUrl = `${base}/reset-password?token=${encodeURIComponent(token)}`;
		const cancelUrl = `${base}/reset-password/cancel?token=${encodeURIComponent(token)}`;

		const displayTitle = site?.siteTitle?.trim() || "Password reset";
		const logoUrl = this.siteSettings.getEmailLogoAbsoluteUrl(
			site?.logoKey ?? null,
			site?.cdnUrl ?? null
		);
		const logoAlt = this.siteSettings.getDisplaySiteTitle(site?.siteTitle);

		const from = this.mail.fromAddress(siteUrlHttp);
		const validMinutes = Math.floor(PASSWORD_RESET_JWT_TTL_SECONDS / 60);
		const html = buildTransactionalEmailHtml({
			heading: displayTitle,
			logoUrl,
			logoAlt,
			bodyHtml: passwordResetBodyHtml(resetUrl, cancelUrl, validMinutes),
			footerLine: `Sent by ${logoAlt}. If you did not request a password reset, you can ignore this email.`,
		});

		try {
			await this.mail.send({
				from,
				to: user.email.trim(),
				subject: `Reset your password — ${displayTitle}`,
				html,
				text: `Reset your password: ${resetUrl}\n\nIf you did not request this, cancel the reset (invalidates the link): ${cancelUrl}`,
			});
			logPasswordReset({
				step: "email_sent",
				userId: user.id,
				challengeId,
				emailMasked,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logPasswordReset({
				step: "email_send_failed",
				userId: user.id,
				challengeId,
				emailMasked,
				error: message,
			});
			throw error;
		}
	}

	async completePasswordReset(token: string, newPassword: string): Promise<void> {
		logPasswordReset({ step: "complete_start" });
		const { challengeId, userId } = await verifyPasswordResetJwt(this.env, token);
		const row = await this.challengeRepo.getById(challengeId);
		if (!row || row.kind !== "password_reset" || row.userId !== userId) {
			logPasswordReset({ step: "complete_rejected", reason: "missing_or_mismatch", challengeId, userId });
			throw new Error("Invalid or expired reset link.");
		}
		if (row.consumedAt) {
			logPasswordReset({ step: "complete_rejected", reason: "already_used", challengeId, userId });
			throw new Error("This reset link has already been used.");
		}
		if (row.expiresAt <= new Date().toISOString()) {
			logPasswordReset({ step: "complete_rejected", reason: "expired", challengeId, userId });
			throw new Error("This reset link has expired.");
		}
		const hash = await hashPassword(newPassword, {
			argonHasher: this.cfEnv.ARGON_HASHER,
			hashMethod: resolveHashMethod(this.env),
		});
		await this.userRepo.update(userId, { passwordHash: hash });
		await this.challengeRepo.markConsumed(challengeId, new Date().toISOString());
		logPasswordReset({ step: "complete_success", challengeId, userId });
	}

	/**
	 * Deletes the password_reset challenge so the emailed link stops working.
	 * Uses the same JWT as the reset link.
	 */
	async cancelPasswordReset(token: string): Promise<void> {
		logPasswordReset({ step: "cancel_start" });
		const { challengeId, userId } = await verifyPasswordResetJwt(this.env, token);
		const row = await this.challengeRepo.getById(challengeId);
		if (!row) {
			logPasswordReset({ step: "cancel_noop", reason: "challenge_not_found", challengeId, userId });
			return;
		}
		if (row.kind !== "password_reset" || row.userId !== userId) {
			logPasswordReset({ step: "cancel_rejected", reason: "missing_or_mismatch", challengeId, userId });
			throw new Error("Invalid or expired reset link.");
		}
		if (row.consumedAt) {
			logPasswordReset({ step: "cancel_rejected", reason: "already_invalid", challengeId, userId });
			throw new Error("This reset link is no longer valid.");
		}
		await this.challengeRepo.deleteById(challengeId);
		logPasswordReset({ step: "cancel_success", challengeId, userId });
	}
}
