"use server";

import { auth } from "@/auth";
import { onServerAction } from "@/lib/context/on-server-action";

export async function runCleanupTokenArtifacts(): Promise<{
	ok: boolean;
	totalDeleted?: number;
	error?: string;
}> {
	return onServerAction(async (_ctx, getServices) => {
		const session = await auth();
		if (!session?.user?.id) {
			return { ok: false, error: "Unauthorized" };
		}
		const startMs = Date.now();
		const { oauthTokenService, tokenActivityLogService } = getServices();
		try {
			const result = await oauthTokenService.cleanupTokenArtifacts(false);
			const durationMs = Date.now() - startMs;
			await tokenActivityLogService.logActivity({
				ip: null,
				requestType: "cleanup",
				succeeded: true,
				environmentName: "manual",
				durationMs,
			});
			return { ok: true, totalDeleted: result.totalDeleted };
		} catch (err) {
			const durationMs = Date.now() - startMs;
			await tokenActivityLogService.logActivity({
				ip: null,
				requestType: "cleanup",
				succeeded: false,
				environmentName: "manual",
				durationMs,
			}).catch(() => {});
			return {
				ok: false,
				error: err instanceof Error ? err.message : "Cleanup failed",
			};
		}
	});
}

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
