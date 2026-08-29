"use server";

import { auth } from "@/auth";
import { onAdminServerAction } from "@/lib/context/on-server-action";
import type { ClientClaimInput } from "@/lib/repositories/client-claim.repository";

export async function listClients(environmentId?: string) {
	return onAdminServerAction(async (_ctx, getServices) => {
		const { clientService } = getServices();
		return clientService.list(environmentId);
	});
}

export async function getClientWithDetails(id: string) {
	return onAdminServerAction(async (_ctx, getServices) => {
		const { clientService } = getServices();
		return clientService.getClientWithDetails(id);
	});
}

export async function createClient(params: {
	environmentId: string;
	redirectUris?: string[];
	scopeIds?: string[];
	expiresAt?: string | null;
	name?: string | null;
}) {
	return onAdminServerAction(async (_ctx, getServices) => {
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
	const session = await auth();
	const actorUserId = session?.user?.id ?? null;
	return onAdminServerAction(async (_ctx, getServices) => {
		const { clientService } = getServices();
		return clientService.updateRedirectUris(id, uris, actorUserId);
	});
}

export async function updateClientScopes(id: string, scopeIds: string[]) {
	const session = await auth();
	const actorUserId = session?.user?.id ?? null;
	return onAdminServerAction(async (_ctx, getServices) => {
		const { clientService } = getServices();
		return clientService.updateScopes(id, scopeIds, actorUserId);
	});
}

export async function updateClientClaims(id: string, claims: ClientClaimInput[]) {
	const session = await auth();
	const actorUserId = session?.user?.id ?? null;
	return onAdminServerAction(async (_ctx, getServices) => {
		const { clientService } = getServices();
		return clientService.updateClaims(id, claims, actorUserId);
	});
}

export async function deleteClient(id: string) {
	const session = await auth();
	const actorUserId = session?.user?.id ?? null;
	return onAdminServerAction(async (_ctx, getServices) => {
		const { clientService } = getServices();
		return clientService.delete(id, actorUserId);
	});
}

export async function rotateClientSecret(id: string) {
	const session = await auth();
	const actorUserId = session?.user?.id ?? null;
	return onAdminServerAction(async (_ctx, getServices) => {
		const { clientService } = getServices();
		return clientService.rotateSecret(id, actorUserId);
	});
}

export async function updateClientName(id: string, name: string | null) {
	const session = await auth();
	const actorUserId = session?.user?.id ?? null;
	return onAdminServerAction(async (_ctx, getServices) => {
		const { clientService } = getServices();
		return clientService.updateName(id, name, actorUserId);
	});
}
