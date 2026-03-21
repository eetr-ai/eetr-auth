import { timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { getDb } from "@/lib/db";
import type { RequestContext } from "@/lib/context/types";
import { UserRepositoryD1 } from "@/lib/repositories/admin.repository.d1";
import { UserChallengeRepositoryD1 } from "@/lib/repositories/user-challenge.repository.d1";
import { SiteSettingsRepositoryD1 } from "@/lib/repositories/site-settings.repository.d1";
import { getAuthSecret } from "@/lib/auth/auth-secret";
import { hashPassword, verifyPassword } from "@/lib/auth/password-hash";
import {
	signPasswordResetJwt,
	verifyPasswordResetJwt,
	PASSWORD_RESET_JWT_TTL_SECONDS,
} from "@/lib/auth/password-reset-jwt";
import { resolveIssuerBaseUrl } from "@/lib/config/issuer-base-url";
import {
	buildTransactionalEmailHtml,
	mfaOtpBodyHtml,
	passwordResetBodyHtml,
} from "@/lib/email/transactional-html";
import { TransactionalEmailService } from "./transactional-email.service";
import { SiteSettingsService } from "./site-settings.service";
import type { UserWithPassword } from "@/lib/repositories/admin.repository";

const MFA_OTP_TTL_MS = 10 * 60 * 1000;

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

function timingSafeEqualHex(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	try {
		return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
	} catch {
		return false;
	}
}

export class UserChallengeService {
	private readonly userRepo: UserRepositoryD1;
	private readonly challengeRepo: UserChallengeRepositoryD1;
	private readonly siteRepo: SiteSettingsRepositoryD1;
	private readonly siteSettings: SiteSettingsService;
	private readonly mail: TransactionalEmailService;
	private readonly env: Record<string, unknown>;
	private readonly cfEnv: CloudflareEnv;

	constructor(ctx: RequestContext) {
		const db = getDb(ctx.env);
		this.userRepo = new UserRepositoryD1(db);
		this.challengeRepo = new UserChallengeRepositoryD1(db);
		this.siteRepo = new SiteSettingsRepositoryD1(db);
		this.siteSettings = new SiteSettingsService(ctx);
		this.mail = new TransactionalEmailService(ctx);
		this.cfEnv = ctx.env;
		this.env = ctx.env as unknown as Record<string, unknown>;
	}

	async verifyUsernamePassword(username: string, password: string): Promise<UserWithPassword | null> {
		const user = await this.userRepo.findByUsername(username.trim());
		if (!user) return null;
		const v = await verifyPassword(password, user.passwordHash, {
			argonHasher: this.cfEnv.ARGON_HASHER,
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
			siteUrlHttp,
			site?.logoKey ?? null,
			site?.cdnUrl ?? null
		);
		const logoAlt = this.siteSettings.getDisplaySiteTitle(site?.siteTitle);

		const from = this.mail.noReplyFromAddress(siteUrlHttp);
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

	async verifyMfaOtpAndConsume(challengeId: string, userId: string, code: string): Promise<boolean> {
		const row = await this.challengeRepo.getById(challengeId);
		if (!row || row.kind !== "mfa_otp" || row.userId !== userId) {
			return false;
		}
		if (row.consumedAt) return false;
		if (row.expiresAt <= new Date().toISOString()) {
			await this.challengeRepo.deleteById(challengeId);
			return false;
		}
		const expected = await hashMfaOtp(challengeId, code.trim());
		if (!timingSafeEqualHex(expected, row.codeHash ?? "")) {
			return false;
		}
		await this.challengeRepo.deleteById(challengeId);
		return true;
	}

	/**
	 * Always completes without revealing whether the email exists.
	 */
	async requestPasswordReset(emailRaw: string): Promise<void> {
		const email = emailRaw.trim().toLowerCase();
		const genericDone = async () => {
			await Promise.resolve();
		};
		if (!email) {
			await genericDone();
			return;
		}

		const user = await this.userRepo.findByEmail(email);
		if (!user?.email?.trim()) {
			await genericDone();
			return;
		}

		const site = await this.siteRepo.get();
		const siteUrl = site?.siteUrl?.trim();
		if (!siteUrl || !this.mail.getResendApiKey()) {
			await genericDone();
			return;
		}

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

		const base = resolveIssuerBaseUrl(this.env);
		const resetUrl = `${base}/reset-password?token=${encodeURIComponent(token)}`;
		const cancelUrl = `${base}/reset-password/cancel?token=${encodeURIComponent(token)}`;

		const displayTitle = site?.siteTitle?.trim() || "Password reset";
		const siteUrlHttp = siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`;
		const logoUrl = this.siteSettings.getEmailLogoAbsoluteUrl(
			siteUrlHttp,
			site?.logoKey ?? null,
			site?.cdnUrl ?? null
		);
		const logoAlt = this.siteSettings.getDisplaySiteTitle(site?.siteTitle);

		const from = this.mail.noReplyFromAddress(siteUrlHttp);
		const validMinutes = Math.floor(PASSWORD_RESET_JWT_TTL_SECONDS / 60);
		const html = buildTransactionalEmailHtml({
			heading: displayTitle,
			logoUrl,
			logoAlt,
			bodyHtml: passwordResetBodyHtml(resetUrl, cancelUrl, validMinutes),
			footerLine: `Sent by ${logoAlt}. If you did not request a password reset, you can ignore this email.`,
		});

		await this.mail.send({
			from,
			to: user.email.trim(),
			subject: `Reset your password — ${displayTitle}`,
			html,
			text: `Reset your password: ${resetUrl}\n\nIf you did not request this, cancel the reset (invalidates the link): ${cancelUrl}`,
		});
	}

	async completePasswordReset(token: string, newPassword: string): Promise<void> {
		const { challengeId, userId } = await verifyPasswordResetJwt(this.env, token);
		const row = await this.challengeRepo.getById(challengeId);
		if (!row || row.kind !== "password_reset" || row.userId !== userId) {
			throw new Error("Invalid or expired reset link.");
		}
		if (row.consumedAt) {
			throw new Error("This reset link has already been used.");
		}
		if (row.expiresAt <= new Date().toISOString()) {
			throw new Error("This reset link has expired.");
		}
		const hash = await hashPassword(newPassword);
		await this.userRepo.update(userId, { passwordHash: hash });
		await this.challengeRepo.markConsumed(challengeId, new Date().toISOString());
	}

	/**
	 * Deletes the password_reset challenge so the emailed link stops working.
	 * Uses the same JWT as the reset link.
	 */
	async cancelPasswordReset(token: string): Promise<void> {
		const { challengeId, userId } = await verifyPasswordResetJwt(this.env, token);
		const row = await this.challengeRepo.getById(challengeId);
		if (!row) {
			return;
		}
		if (row.kind !== "password_reset" || row.userId !== userId) {
			throw new Error("Invalid or expired reset link.");
		}
		if (row.consumedAt) {
			throw new Error("This reset link is no longer valid.");
		}
		await this.challengeRepo.deleteById(challengeId);
	}
}
