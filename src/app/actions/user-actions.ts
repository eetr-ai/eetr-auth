"use server";

import { onServerAction } from "@/lib/context/on-server-action";

export async function getCurrentUser() {
	return onServerAction(async (ctx, getServices) => {
		const { userService } = getServices();
		return userService.getCurrentUser(ctx);
	});
}

export async function getUserById(id: string) {
	return onServerAction(async (_ctx, getServices) => {
		const { userService } = getServices();
		return userService.getById(id);
	});
}
