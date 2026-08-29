"use server";

import { auth } from "@/auth";
import { onAdminServerAction } from "@/lib/context/on-server-action";

export async function listUserConsents(userId: string) {
	return onAdminServerAction(async (_ctx, getServices) => {
		const { consentService } = getServices();
		return consentService.listForUser(userId);
	});
}

export async function revokeUserConsent(userId: string, clientRowId: string) {
	const session = await auth();
	const actorUserId = session?.user?.id ?? null;
	return onAdminServerAction(async (_ctx, getServices) => {
		const { consentService } = getServices();
		return consentService.revoke(userId, clientRowId, actorUserId);
	});
}
