"use server";

import { cookies } from "next/headers";
import { onPublicServerAction } from "@/lib/context/on-public-server-action";
import { EMAIL_VERIFICATION_CHALLENGE_COOKIE } from "@/lib/auth/email-verification-cookie";
import { MFA_CHALLENGE_COOKIE } from "@/lib/auth/mfa-cookie";
const MFA_COOKIE_MAX_AGE = 600;
const EMAIL_VERIFICATION_COOKIE_MAX_AGE = 600;

export async function beginSignInChallenge(username: string, password: string) {
	return onPublicServerAction(async (_ctx, getServices) => {
		const { userChallengeService, siteSettingsService } = getServices();
		const site = await siteSettingsService.get();
		if (site.mfaEnabled && !site.mfaCanEnable) {
			return { ok: false as const, error: "Configure Site URL and RESEND_API_KEY before using MFA." };
		}
		const user = await userChallengeService.verifyUsernamePassword(username, password);
		if (!user) {
			return { ok: false as const, error: "Invalid username or password." };
		}
		if (user.isAdmin) {
			return { ok: true as const, challenge: "none" as const };
		}
		if (!user.email?.trim()) {
			return { ok: false as const, error: "Your account has no email address; contact an administrator." };
		}
		const jar = await cookies();

		if (site.mfaEnabled) {
			const challengeId = await userChallengeService.createMfaOtpAndSendEmail(user);
			jar.set(MFA_CHALLENGE_COOKIE, challengeId, {
				httpOnly: true,
				sameSite: "lax",
				secure: process.env.NODE_ENV === "production",
				path: "/",
				maxAge: MFA_COOKIE_MAX_AGE,
			});
			jar.delete(EMAIL_VERIFICATION_CHALLENGE_COOKIE);
			return { ok: true as const, challenge: "mfa" as const };
		}

		if (user.emailVerifiedAt) {
			jar.delete(MFA_CHALLENGE_COOKIE);
			jar.delete(EMAIL_VERIFICATION_CHALLENGE_COOKIE);
			return { ok: true as const, challenge: "none" as const };
		}

		const challengeId = await userChallengeService.createEmailVerificationOtpAndSendEmail(user);
		jar.set(EMAIL_VERIFICATION_CHALLENGE_COOKIE, challengeId, {
			httpOnly: true,
			sameSite: "lax",
			secure: process.env.NODE_ENV === "production",
			path: "/",
			maxAge: EMAIL_VERIFICATION_COOKIE_MAX_AGE,
		});
		jar.delete(MFA_CHALLENGE_COOKIE);
		return { ok: true as const, challenge: "email_verification" as const };
	});
}
