"use server";

import { auth, signOut } from "@/auth";
import { onServerAction } from "@/lib/context/on-server-action";

export async function getCurrentUser() {
	const session = await auth();
	return session?.user ?? null;
}

export async function logout() {
	await signOut({ redirectTo: "/" });
}

export async function getUserById(id: string) {
	return onServerAction(async (_ctx, getServices) => {
		const { userService } = getServices();
		return userService.getById(id);
	});
}

export async function listUsers() {
	return onServerAction(async (_ctx, getServices) => {
		const { userService } = getServices();
		return userService.listUsers();
	});
}

export async function createUser(
	username: string,
	password: string,
	isAdmin = true,
	name?: string | null,
	email?: string | null
) {
	return onServerAction(async (_ctx, getServices) => {
		const { userService } = getServices();
		return userService.createUser(username, password, isAdmin, name, email);
	});
}

export async function updateUser(
	id: string,
	updates: {
		username?: string;
		name?: string | null;
		email?: string | null;
		password?: string;
		isAdmin?: boolean;
		avatarKey?: string | null;
	}
) {
	const session = await auth();
	if (!session?.user?.id) {
		throw new Error("Unauthorized");
	}

	return onServerAction(async (_ctx, getServices) => {
		const { userService } = getServices();
		return userService.updateUser(id, updates, session.user.id);
	});
}

export async function deleteUser(id: string) {
	const session = await auth();
	if (!session?.user?.id) {
		throw new Error("Unauthorized");
	}

	return onServerAction(async (_ctx, getServices) => {
		const { userService } = getServices();
		await userService.deleteUser(id, session.user.id);
		return { ok: true };
	});
}
