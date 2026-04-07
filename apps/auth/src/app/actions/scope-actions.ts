"use server";

import { onServerAction } from "@/lib/context/on-server-action";

export async function listScopes() {
	return onServerAction(async (_ctx, getServices) => {
		const { scopeService } = getServices();
		return scopeService.list();
	});
}

export async function createScope(scopeName: string) {
	return onServerAction(async (_ctx, getServices) => {
		const { scopeService } = getServices();
		return scopeService.create(scopeName);
	});
}

export async function deleteScope(id: string) {
	return onServerAction(async (_ctx, getServices) => {
		const { scopeService } = getServices();
		return scopeService.delete(id);
	});
}
