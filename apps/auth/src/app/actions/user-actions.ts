"use server";

import { auth, signOut } from "@/auth";
import { onAdminServerAction } from "@/lib/context/on-server-action";

export async function getCurrentUser() {
	const session = await auth();
	return session?.user ?? null;
}

export async function logout() {
	await signOut({ redirectTo: "/" });
}

export async function getUserById(id: string) {
	return onAdminServerAction(async (_ctx, getServices) => {
		const { userService } = getServices();
		return userService.getById(id);
	});
}

export async function listUsers() {
	return onAdminServerAction(async (_ctx, getServices) => {
		const { userService } = getServices();
		return userService.listUsers();
	});
}

export async function createUser(
	username: string,
	password: string,
	isAdmin = true,
	name?: string | null,
	email?: string | null,
	/**
	 * Creates a passwordless test user. Immutable afterwards, which is why there is no
	 * counterpart in updateUser's whitelist below.
	 */
	isTestUser = false
) {
	const session = await auth();
	if (!session?.user?.id) {
		throw new Error("Unauthorized");
	}

	return onAdminServerAction(async (_ctx, getServices) => {
		const { userService } = getServices();
		return userService.createUser(username, password, isAdmin, name, email, session.user.id, {
			isTestUser,
		});
	});
}

export async function updateUser(
	id: string,
	updates: {
		username?: string;
		name?: string | null;
		email?: string | null;
		emailVerifiedAt?: string | null;
		password?: string;
		isAdmin?: boolean;
		avatarKey?: string | null;
		avatarStagedKey?: string | null;
		environmentIds?: string[];
	}
) {
	const session = await auth();
	if (!session?.user?.id) {
		throw new Error("Unauthorized");
	}

	// Whitelist the mutable fields explicitly (mirrors the admin bearer API) so a crafted
	// RPC body can't smuggle unknown columns into the update. isAdmin stays allowed but is
	// gated by onAdminServerAction and audited distinctly in the service.
	//
	// isTestUser is deliberately absent and must stay that way: promoting a real user to a
	// passwordless one would leave a real password hash on an account signable with one
	// click, and demoting one would leave an account nobody can sign into. Delete and
	// recreate instead.
	const sanitized = {
		...(updates.username !== undefined ? { username: updates.username } : {}),
		...(updates.name !== undefined ? { name: updates.name } : {}),
		...(updates.email !== undefined ? { email: updates.email } : {}),
		...(updates.emailVerifiedAt !== undefined ? { emailVerifiedAt: updates.emailVerifiedAt } : {}),
		...(updates.password !== undefined ? { password: updates.password } : {}),
		...(updates.isAdmin !== undefined ? { isAdmin: updates.isAdmin } : {}),
		// avatarKey is deliberately not accepted here: an avatar is set by staging an
		// upload and passing avatarStagedKey, and a second path that writes the key
		// straight through would skip that validation entirely.
		...(updates.avatarStagedKey !== undefined
			? { avatarStagedKey: updates.avatarStagedKey }
			: {}),
		...(updates.environmentIds !== undefined ? { environmentIds: updates.environmentIds } : {}),
	};

	return onAdminServerAction(async (_ctx, getServices) => {
		const { userService } = getServices();
		return userService.updateUser(id, sanitized, session.user.id);
	});
}

export async function deleteUser(id: string) {
	const session = await auth();
	if (!session?.user?.id) {
		throw new Error("Unauthorized");
	}

	return onAdminServerAction(async (_ctx, getServices) => {
		const { userService } = getServices();
		await userService.deleteUser(id, session.user.id);
		return { ok: true };
	});
}
