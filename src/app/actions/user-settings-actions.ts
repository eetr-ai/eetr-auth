"use server";

import { auth } from "@/auth";
import { onServerAction } from "@/lib/context/on-server-action";

async function requireSession() {
	const session = await auth();
	if (!session?.user?.id) throw new Error("Unauthorized");
	return session.user.id;
}

export async function updateDisplayName(name: string) {
	const userId = await requireSession();
	return onServerAction(async (_ctx, getServices) => {
		const { userService } = getServices();
		return userService.updateUser(userId, { name: name.trim() || null }, userId);
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
		const { userService, userChallengeService } = getServices();
		const user = await userService.getById(userId);
		if (!user) throw new Error("User not found.");

		const verifiedUser = await userChallengeService.verifyUsernamePassword(user.username, currentPassword);
		if (!verifiedUser || verifiedUser.id !== userId) throw new Error("Current password is incorrect.");

		return userService.updateUser(userId, { password: newPassword }, userId);
	});
}
