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
import { TransactionalEmailService } from "./transactional-email.service";
import type { UserWithPassword } from "@/lib/repositories/admin.repository";

const MFA_OTP_TTL_MS = 10 * 60 * 1000;

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
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
	private readonly mail: TransactionalEmailService;
	private readonly env: Record<string, unknown>;

	constructor(ctx: RequestContext) {
		const db = getDb(ctx.env);
		this.userRepo = new UserRepositoryD1(db);
		this.challengeRepo = new UserChallengeRepositoryD1(db);
		this.siteRepo = new SiteSettingsRepositoryD1(db);
		this.mail = new TransactionalEmailService(ctx);
		this.env = ctx.env as unknown as Record<string, unknown>;
	}

	async verifyUsernamePassword(username: string, password: string): Promise<UserWithPassword | null> {
		const user = await this.userRepo.findByUsername(username.trim());
		if (!user) return null;
		const v = await verifyPassword(password, user.passwordHash);
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
		const logoUrl =
			site?.logoKey && site?.cdnUrl
				? `${site.cdnUrl.replace(/\/+$/, "")}/${site.logoKey.replace(/^\/+/, "")}`
				: null;

		const from = this.mail.noReplyFromAddress(
			siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`
		);
		const html = `
<!DOCTYPE html>
<html><body style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
  ${logoUrl ? `<p><img src="${escapeHtml(logoUrl)}" alt="" width="120" height="120" style="object-fit:contain;" /></p>` : ""}
  <h1 style="font-size: 20px;">${escapeHtml(displayTitle)}</h1>
  <p>Your verification code is:</p>
  <p style="font-size: 28px; letter-spacing: 0.2em; font-weight: bold;">${escapeHtml(code)}</p>
  <p style="color: #666; font-size: 14px;">This code expires in 10 minutes. If you did not try to sign in, ignore this email.</p>
</body></html>`;

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

		const displayTitle = site?.siteTitle?.trim() || "Password reset";
		const logoUrl =
			site?.logoKey && site?.cdnUrl
				? `${site.cdnUrl.replace(/\/+$/, "")}/${site.logoKey.replace(/^\/+/, "")}`
				: null;

		const from = this.mail.noReplyFromAddress(
			siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`
		);

		const html = `
<!DOCTYPE html>
<html><body style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
  ${logoUrl ? `<p><img src="${escapeHtml(logoUrl)}" alt="" width="120" height="120" style="object-fit:contain;" /></p>` : ""}
  <h1 style="font-size: 20px;">${escapeHtml(displayTitle)}</h1>
  <p>We received a request to reset your password. Click the link below (valid for ${Math.floor(PASSWORD_RESET_JWT_TTL_SECONDS / 60)} minutes):</p>
  <p><a href="${escapeHtml(resetUrl)}">${escapeHtml(resetUrl)}</a></p>
  <p style="color: #666; font-size: 14px;">If you did not request this, you can ignore this email.</p>
</body></html>`;

		await this.mail.send({
			from,
			to: user.email.trim(),
			subject: `Reset your password — ${displayTitle}`,
			html,
			text: `Reset your password: ${resetUrl}`,
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
}
