"use server";

import { onPublicServerAction } from "@/lib/context/on-public-server-action";

export async function requestPasswordReset(email: string) {
	return onPublicServerAction(async (_ctx, getServices) => {
		const { userChallengeService } = getServices();
		await userChallengeService.requestPasswordReset(email);
		return { ok: true as const };
	});
}

export async function completePasswordReset(token: string, newPassword: string) {
	return onPublicServerAction(async (_ctx, getServices) => {
		const { userChallengeService } = getServices();
		await userChallengeService.completePasswordReset(token, newPassword);
		return { ok: true as const };
	});
}
