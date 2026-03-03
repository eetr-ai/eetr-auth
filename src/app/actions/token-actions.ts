"use server";

import { onServerAction } from "@/lib/context/on-server-action";

export async function listTokenActivity() {
	return onServerAction(async (_ctx, getServices) => {
		const { oauthTokenService } = getServices();
		return oauthTokenService.listTokenActivity();
	});
}

export async function listTokenActivityByClient(clientId: string) {
	return onServerAction(async (_ctx, getServices) => {
		const { oauthTokenService } = getServices();
		return oauthTokenService.listTokenActivity(clientId);
	});
}
