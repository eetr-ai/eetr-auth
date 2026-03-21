"use server";

import { cookies } from "next/headers";
import { onPublicServerAction } from "@/lib/context/on-public-server-action";
import { MFA_CHALLENGE_COOKIE } from "@/lib/auth/mfa-cookie";
const MFA_COOKIE_MAX_AGE = 600;

export async function beginMfaSignIn(username: string, password: string) {
	return onPublicServerAction(async (_ctx, getServices) => {
		const { userChallengeService, siteSettingsService } = getServices();
		const site = await siteSettingsService.get();
		if (!site.mfaEnabled) {
			return { ok: false as const, error: "MFA is not enabled." };
		}
		if (!site.mfaCanEnable) {
			return { ok: false as const, error: "Configure Site URL and RESEND_API_KEY before using MFA." };
		}
		const user = await userChallengeService.verifyUsernamePassword(username, password);
		if (!user) {
			return { ok: false as const, error: "Invalid username or password." };
		}
		if (!user.email?.trim()) {
			return { ok: false as const, error: "Your account has no email address; contact an administrator." };
		}
		const challengeId = await userChallengeService.createMfaOtpAndSendEmail(user);
		const jar = await cookies();
		jar.set(MFA_CHALLENGE_COOKIE, challengeId, {
			httpOnly: true,
			sameSite: "lax",
			secure: process.env.NODE_ENV === "production",
			path: "/",
			maxAge: MFA_COOKIE_MAX_AGE,
		});
		return { ok: true as const };
	});
}
