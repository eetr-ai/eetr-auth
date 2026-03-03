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

export async function revokeTokenByValue(token: string) {
	return onServerAction(async (_ctx, getServices) => {
		const { oauthTokenService } = getServices();
		return oauthTokenService.revokeTokenByValue(token);
	});
}

export async function deleteTokenByValue(token: string) {
	return onServerAction(async (_ctx, getServices) => {
		const { oauthTokenService } = getServices();
		return oauthTokenService.deleteTokenByValue(token);
	});
}
