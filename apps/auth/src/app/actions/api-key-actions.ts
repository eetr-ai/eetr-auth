"use server";

import { auth } from "@/auth";
import { onAdminServerAction } from "@/lib/context/on-server-action";

export async function listClientApiKeys(clientRowId: string) {
	return onAdminServerAction(async (_ctx, getServices) => {
		const { apiKeyService } = getServices();
		return apiKeyService.list(clientRowId);
	});
}

export async function createClientApiKey(params: {
	clientRowId: string;
	userId: string;
	name?: string | null;
	expiresAt?: string | null;
	/** Subset of the client's granted scopes. Omit for all of them. */
	scopeNames?: string[];
}) {
	// Read outside the wrapper, like the sibling client actions, so the acting admin is
	// attributed on the audit entry.
	const session = await auth();
	const actorUserId = session?.user?.id ?? null;
	return onAdminServerAction(async (_ctx, getServices) => {
		const { apiKeyService } = getServices();
		return apiKeyService.create(params, actorUserId);
	});
}

export async function revokeClientApiKey(id: string) {
	const session = await auth();
	const actorUserId = session?.user?.id ?? null;
	return onAdminServerAction(async (_ctx, getServices) => {
		const { apiKeyService } = getServices();
		return apiKeyService.revoke(id, actorUserId);
	});
}
