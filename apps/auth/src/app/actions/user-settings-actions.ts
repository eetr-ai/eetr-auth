"use server";

import { auth } from "@/auth";
import { onServerAction } from "@/lib/context/on-server-action";
import { summarizePasswordPolicyViolations } from "@/lib/auth/password-policy-validation";

async function requireSession() {
	const session = await auth();
	if (!session?.user?.id) throw new Error("Unauthorized");
	return session.user.id;
}

/**
 * The active admin sign-in policy, for live client-side validation of an admin's own
 * password change. Returns null for non-admins (the policy doesn't apply to them).
 */
export async function getAdminPasswordPolicy() {
	const session = await auth();
	if (!session?.user?.id || !session.user.isAdmin) return null;
	return onServerAction(async (_ctx, getServices) => {
		const { passwordPolicyService } = getServices();
		return passwordPolicyService.getAdminPolicy();
	});
}

/**
 * Saves the signed-in user's own profile.
 *
 * `avatarStagedKey` comes from `POST /api/users/avatar/stage`: the picture is
 * only promoted here, on save, so choosing one and navigating away leaves the
 * current avatar in place.
 */
export async function updateProfile(input: { name: string; avatarStagedKey?: string | null }) {
	const userId = await requireSession();
	return onServerAction(async (_ctx, getServices) => {
		const { userService } = getServices();
		return userService.updateUser(
			userId,
			{
				name: input.name.trim() || null,
				...(input.avatarStagedKey ? { avatarStagedKey: input.avatarStagedKey } : {}),
			},
			userId
		);
	});
}

export async function updateUsername(username: string) {
	const userId = await requireSession();
	return onServerAction(async (_ctx, getServices) => {
		const { userService } = getServices();
		return userService.updateUser(userId, { username: username.trim() }, userId);
	});
}

export async function changePassword(currentPassword: string, newPassword: string) {
	const userId = await requireSession();
	return onServerAction(async (_ctx, getServices) => {
		const { userService, userChallengeService, passwordPolicyService } = getServices();
		const user = await userService.getById(userId);
		if (!user) throw new Error("User not found.");

		const verifiedUser = await userChallengeService.verifyUsernamePassword(user.username, currentPassword);
		if (!verifiedUser || verifiedUser.id !== userId) throw new Error("Current password is incorrect.");

		// Admins have no environment, so enforce the active admin sign-in policy (if any)
		// on the new password before persisting it.
		if (user.isAdmin) {
			const check = await passwordPolicyService.validateAdminPassword(newPassword, {
				username: user.username,
				email: user.email,
			});
			if (!check.ok) {
				throw new Error(summarizePasswordPolicyViolations(check.violations));
			}
		}

		return userService.updateUser(userId, { password: newPassword }, userId);
	});
}
