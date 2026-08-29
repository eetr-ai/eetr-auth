"use server";

import { auth } from "@/auth";
import { onAdminServerAction } from "@/lib/context/on-server-action";

export async function listScopes() {
	return onAdminServerAction(async (_ctx, getServices) => {
		const { scopeService } = getServices();
		return scopeService.list();
	});
}

export async function createScope(
	scopeName: string,
	displayName: string | null = null,
	description: string | null = null
) {
	const session = await auth();
	const actorUserId = session?.user?.id ?? null;
	return onAdminServerAction(async (_ctx, getServices) => {
		const { scopeService } = getServices();
		return scopeService.create(scopeName, { displayName, description }, actorUserId);
	});
}

export async function updateScope(
	id: string,
	displayName: string | null,
	description: string | null
) {
	const session = await auth();
	const actorUserId = session?.user?.id ?? null;
	return onAdminServerAction(async (_ctx, getServices) => {
		const { scopeService } = getServices();
		return scopeService.update(id, { displayName, description }, actorUserId);
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
