"use server";

import { onAdminServerAction } from "@/lib/context/on-server-action";

export async function listScopes() {
	return onAdminServerAction(async (_ctx, getServices) => {
		const { scopeService } = getServices();
		return scopeService.list();
	});
}

export async function createScope(scopeName: string) {
	return onAdminServerAction(async (_ctx, getServices) => {
		const { scopeService } = getServices();
		return scopeService.create(scopeName);
	});
}

export async function deleteScope(id: string) {
	return onAdminServerAction(async (_ctx, getServices) => {
		const { scopeService } = getServices();
		return scopeService.delete(id);
	});
}
