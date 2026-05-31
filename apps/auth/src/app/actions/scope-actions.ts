"use server";

import { auth } from "@/auth";
import { onAdminServerAction } from "@/lib/context/on-server-action";

export async function listScopes() {
	return onAdminServerAction(async (_ctx, getServices) => {
		const { scopeService } = getServices();
		return scopeService.list();
	});
}

export async function createScope(scopeName: string) {
	const session = await auth();
	const actorUserId = session?.user?.id ?? null;
	return onAdminServerAction(async (_ctx, getServices) => {
		const { scopeService } = getServices();
		return scopeService.create(scopeName, actorUserId);
	});
}

export async function deleteScope(id: string) {
	const session = await auth();
	const actorUserId = session?.user?.id ?? null;
	return onAdminServerAction(async (_ctx, getServices) => {
		const { scopeService } = getServices();
		return scopeService.delete(id, actorUserId);
	});
}
