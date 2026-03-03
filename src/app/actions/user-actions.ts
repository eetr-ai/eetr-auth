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

export async function createUser(username: string, password: string) {
	return onServerAction(async (_ctx, getServices) => {
		const { userService } = getServices();
		return userService.createUser(username, password);
	});
}
