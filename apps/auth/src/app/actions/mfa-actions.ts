"use server";

import { auth, signOut } from "@/auth";
import { cookies } from "next/headers";
import { onPublicServerAction } from "@/lib/context/on-public-server-action";
import { EMAIL_VERIFICATION_CHALLENGE_COOKIE } from "@/lib/auth/email-verification-cookie";
import { MFA_CHALLENGE_COOKIE } from "@/lib/auth/mfa-cookie";
const MFA_COOKIE_MAX_AGE = 600;
const EMAIL_VERIFICATION_COOKIE_MAX_AGE = 600;

export async function clearSignInChallenge() {
	const jar = await cookies();
	jar.delete(MFA_CHALLENGE_COOKIE);
	jar.delete(EMAIL_VERIFICATION_CHALLENGE_COOKIE);
	return { ok: true as const };
}

export async function signOutFromChallenge() {
	const jar = await cookies();
	jar.delete(MFA_CHALLENGE_COOKIE);
	jar.delete(EMAIL_VERIFICATION_CHALLENGE_COOKIE);
	const session = await auth();
	if (session?.user?.id) {
		await signOut({ redirectTo: "/" });
	}
	return { ok: true as const };
}

export async function beginSignInChallenge(username: string, password: string) {
	return onPublicServerAction(async (_ctx, getServices) => {
		const { userChallengeService, siteSettingsService, totpService } = getServices();
		const site = await siteSettingsService.get();
		const user = await userChallengeService.verifyUsernamePassword(username, password);
		if (!user) {
			return { ok: false as const, error: "Invalid username or password." };
		}

		const totpEnrolled = (await totpService.getStatus(user.id)).enrolled;
		const siteWantsEmailMfa = site.mfaEnabled;
		const emailMfaUsable = siteWantsEmailMfa && site.mfaCanEnable && !!user.email?.trim();

		// Site mandates MFA (email) but it's unusable here and the user has no TOTP fallback.
		if (siteWantsEmailMfa && !emailMfaUsable && !totpEnrolled) {
			if (!site.mfaCanEnable) {
				return { ok: false as const, error: "Configure Site URL and RESEND_API_KEY before using MFA." };
			}
			return { ok: false as const, error: "Your account has no email address; contact an administrator." };
		}

		const methods: ("totp" | "email")[] = [];
		if (totpEnrolled) methods.push("totp");
		if (emailMfaUsable) methods.push("email");

		const jar = await cookies();

		if (methods.length > 0) {
			jar.delete(EMAIL_VERIFICATION_CHALLENGE_COOKIE);
			// Send the email code now only when email is the user's sole option. With a
			// choice available, defer until they pick email (requestEmailMfaCode) so we don't
			// email users who will use their authenticator app.
			if (methods.length === 1 && methods[0] === "email") {
				const challengeId = await userChallengeService.createMfaOtpAndSendEmail(user);
				jar.set(MFA_CHALLENGE_COOKIE, challengeId, {
					httpOnly: true,
					sameSite: "lax",
					secure: process.env.NODE_ENV === "production",
					path: "/",
					maxAge: MFA_COOKIE_MAX_AGE,
				});
			} else {
				jar.delete(MFA_CHALLENGE_COOKIE);
			}
			return { ok: true as const, challenge: "mfa" as const, methods };
		}

		if (user.isAdmin) {
			return { ok: true as const, challenge: "none" as const };
		}

		// Email verification on sign-in is only enforced when email MFA is enabled
		// globally — it shares the same email infrastructure, so when that's off there's
		// no way to send a verification code. Don't block sign-in (including accounts
		// with no email address) on a check we can't perform.
		const emailMfaEnabledGlobally = siteWantsEmailMfa && site.mfaCanEnable;
		if (!emailMfaEnabledGlobally || user.emailVerifiedAt) {
			jar.delete(MFA_CHALLENGE_COOKIE);
			jar.delete(EMAIL_VERIFICATION_CHALLENGE_COOKIE);
			return { ok: true as const, challenge: "none" as const };
		}
		if (!user.email?.trim()) {
			return { ok: false as const, error: "Your account has no email address; contact an administrator." };
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

/**
 * Sends an email MFA code on demand — used when a user who has both TOTP and email
 * available chooses the email option at the method picker. Re-verifies the password
 * (anti-bombing) and sets the MFA challenge cookie.
 */
export async function requestEmailMfaCode(username: string, password: string) {
	return onPublicServerAction(async (_ctx, getServices) => {
		const { userChallengeService, siteSettingsService } = getServices();
		const site = await siteSettingsService.get();
		if (!site.mfaEnabled || !site.mfaCanEnable) {
			return { ok: false as const, error: "Email codes are not available." };
		}
		const user = await userChallengeService.verifyUsernamePassword(username, password);
		if (!user) {
			return { ok: false as const, error: "Invalid username or password." };
		}
		if (!user.email?.trim()) {
			return { ok: false as const, error: "Your account has no email address; contact an administrator." };
		}
		const jar = await cookies();
		const challengeId = await userChallengeService.createMfaOtpAndSendEmail(user);
		jar.set(MFA_CHALLENGE_COOKIE, challengeId, {
			httpOnly: true,
			sameSite: "lax",
			secure: process.env.NODE_ENV === "production",
			path: "/",
			maxAge: MFA_COOKIE_MAX_AGE,
		});
		jar.delete(EMAIL_VERIFICATION_CHALLENGE_COOKIE);
		return { ok: true as const };
	});
}
