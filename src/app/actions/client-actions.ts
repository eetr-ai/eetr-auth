"use server";

import { auth } from "@/auth";
import { onServerAction } from "@/lib/context/on-server-action";

export async function listClients(environmentId?: string) {
	return onServerAction(async (_ctx, getServices) => {
		const { clientService } = getServices();
		return clientService.list(environmentId);
	});
}

export async function getClientWithDetails(id: string) {
	return onServerAction(async (_ctx, getServices) => {
		const { clientService } = getServices();
		return clientService.getClientWithDetails(id);
	});
}

export async function createClient(params: {
	environmentId: string;
	redirectUris?: string[];
	scopeIds?: string[];
	expiresAt?: string | null;
}) {
	return onServerAction(async (_ctx, getServices) => {
		const session = await auth();
		const createdBy = session?.user?.id;
		if (!createdBy) {
			throw new Error("Unauthorized");
		}
		const { clientService } = getServices();
		return clientService.create({
			...params,
			createdBy,
		});
	});
}

export async function updateClientRedirectUris(id: string, uris: string[]) {
	return onServerAction(async (_ctx, getServices) => {
		const { clientService } = getServices();
		return clientService.updateRedirectUris(id, uris);
	});
}

export async function updateClientScopes(id: string, scopeIds: string[]) {
	return onServerAction(async (_ctx, getServices) => {
		const { clientService } = getServices();
		return clientService.updateScopes(id, scopeIds);
	});
}

export async function deleteClient(id: string) {
	return onServerAction(async (_ctx, getServices) => {
		const { clientService } = getServices();
		return clientService.delete(id);
	});
}

export async function rotateClientSecret(id: string) {
	return onServerAction(async (_ctx, getServices) => {
		const { clientService } = getServices();
		return clientService.rotateSecret(id);
	});
}
