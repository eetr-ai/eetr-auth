"use server";

import { auth, signOut } from "@/auth";
import { cookies } from "next/headers";
import { onPublicServerAction } from "@/lib/context/on-public-server-action";
import { EMAIL_VERIFICATION_CHALLENGE_COOKIE } from "@/lib/auth/email-verification-cookie";
import { MFA_CHALLENGE_COOKIE } from "@/lib/auth/mfa-cookie";
import { resolvePendingEnvironmentId } from "@/lib/auth/pending-client";
import { summarizePasswordPolicyViolations } from "@/lib/auth/password-policy-validation";
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
	return onPublicServerAction(async (ctx, getServices) => {
		const {
			userChallengeService,
			siteSettingsService,
			totpService,
			passwordPolicyService,
			clientService,
			userService,
		} = getServices();
		const site = await siteSettingsService.get();
		const user = await userChallengeService.verifyUsernamePassword(username, password);
		if (!user) {
			return { ok: false as const, error: "Invalid username or password." };
		}

		// Environment of the client being signed in to (null for a non-OAuth/dashboard login).
		const environmentId = await resolvePendingEnvironmentId(clientService, ctx.env as unknown as Record<string, unknown>);

		// Environment access: the user must be granted the client's environment. The
		// authorization endpoint enforces this authoritatively; this is the friendly,
		// early denial on the fresh-login path. Admins are scoped too (no bypass).
		if (environmentId) {
			const userEnvironments = await userService.getUserEnvironments(user.id);
			if (!userEnvironments.includes(environmentId)) {
				return { ok: false as const, error: "You don't have access to this application." };
			}
		}

		// Password max-age gate (runs before MFA so an expired credential can't reach a
		// session). The policy decision and the reset-email dispatch live in their
		// respective services; this action only maps the outcome to cookies + response.
		// Admins authenticate against the global admin policy (they have no environment);
		// everyone else against the policies of the environments they're granted.
		if (await passwordPolicyService.isPasswordExpiredForUser(user.id, user.passwordUpdatedAt, user.isAdmin)) {
			const emailSent = await userChallengeService.sendExpiredPasswordReset(user);
			const jar = await cookies();
			jar.delete(MFA_CHALLENGE_COOKIE);
			jar.delete(EMAIL_VERIFICATION_CHALLENGE_COOKIE);
			return { ok: true as const, challenge: "password_expired" as const, emailSent };
		}

		// Password complexity gate. Like the max-age gate above, runs before MFA so an
		// out-of-policy credential can't reach a session. The policy is scoped to the
		// environment of the client being signed in to (admins use the admin policy). The
		// user proved the current password; they must set a compliant one in place to continue.
		const complexity = await passwordPolicyService.checkSignInPasswordComplexity({
			userId: user.id,
			isAdmin: user.isAdmin,
			environmentId,
			password,
			identifiers: { username: user.username, email: user.email },
		});
		if (!complexity.ok && complexity.policy) {
			const jar = await cookies();
			jar.delete(MFA_CHALLENGE_COOKIE);
			jar.delete(EMAIL_VERIFICATION_CHALLENGE_COOKIE);
			return {
				ok: true as const,
				challenge: "password_complexity" as const,
				policy: complexity.policy,
				username: user.username,
				email: user.email,
			};
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
 * In-place password change during the sign-in complexity gate. The user has proven the
 * current password but it fails the policy of the client's environment, so they set a
 * compliant one here before continuing. Public (no session yet); re-verifies the current
 * password and validates the new one server-side against the same policy.
 */
export async function changePasswordAtSignIn(
	username: string,
	currentPassword: string,
	newPassword: string
): Promise<{ ok: true } | { ok: false; error: string }> {
	return onPublicServerAction(async (ctx, getServices) => {
		const { userChallengeService, passwordPolicyService, clientService, userService } = getServices();
		const user = await userChallengeService.verifyUsernamePassword(username, currentPassword);
		if (!user) {
			return { ok: false as const, error: "Invalid username or password." };
		}
		// New password must actually differ — block resubmitting the same failing password.
		if (await userChallengeService.verifyUsernamePassword(username, newPassword)) {
			return { ok: false as const, error: "Choose a password different from your current one." };
		}

		const environmentId = await resolvePendingEnvironmentId(clientService, ctx.env as unknown as Record<string, unknown>);
		const complexity = await passwordPolicyService.checkSignInPasswordComplexity({
			userId: user.id,
			isAdmin: user.isAdmin,
			environmentId,
			password: newPassword,
			identifiers: { username: user.username, email: user.email },
		});
		if (!complexity.ok) {
			return { ok: false as const, error: summarizePasswordPolicyViolations(complexity.violations) };
		}

		// updateUser hashes, stamps password_updated_at, and writes the audit entry.
		await userService.updateUser(user.id, { password: newPassword }, user.id);
		console.info(
			JSON.stringify({
				event: "sign_in_password_change",
				ts: new Date().toISOString(),
				outcome: "success",
				userId: user.id,
				username: user.username,
			})
		);
		return { ok: true as const };
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
