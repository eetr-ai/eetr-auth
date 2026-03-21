import openNextWorker from "./.open-next/worker.js";
import { OauthTokenService } from "./src/lib/services/oauth-token.service";
import { getDb } from "./src/lib/db";
import { TokenActivityLogRepositoryD1 } from "./src/lib/repositories/token-activity-log.repository.d1";

type CronMetadata = {
	cron: string | null;
	scheduledTime: string | null;
};

function getCronMetadata(controller: ScheduledController): CronMetadata {
	const scheduledAtIso =
		typeof controller.scheduledTime === "number"
			? new Date(controller.scheduledTime).toISOString()
			: null;
	const cron =
		typeof controller.cron === "string" && controller.cron.trim().length > 0
			? controller.cron
			: null;

	return {
		cron,
		scheduledTime: scheduledAtIso,
	};
}

function toErrorDetails(error: unknown) {
	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message,
			stack: error.stack ?? null,
		};
	}

	return {
		name: "UnknownError",
		message: typeof error === "string" ? error : JSON.stringify(error),
		stack: null,
	};
}

const worker = {
	async fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext) {
		return openNextWorker.fetch(request, env, ctx);
	},
	async scheduled(controller: ScheduledController, env: CloudflareEnv) {
		const startedAtMs = Date.now();
		const startedAt = new Date(startedAtMs).toISOString();
		const requestId = crypto.randomUUID();
		const cronMetadata = getCronMetadata(controller);

		try {
			const oauthTokenService = new OauthTokenService({
				env,
				requestId,
			});
			const result = await oauthTokenService.cleanupTokenArtifacts(false);

			const retentionDays = 7;
			const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
			const activityLogRepo = new TokenActivityLogRepositoryD1(getDb(env));
			const tokenActivityLogDeleted = await activityLogRepo.deleteOlderThan(cutoff);

			const endedAtMs = Date.now();
			const durationMs = endedAtMs - startedAtMs;

			await activityLogRepo.insert({
				id: crypto.randomUUID(),
				ip_address: null,
				request_type: "cleanup",
				succeeded: 1,
				environment_name: "scheduled",
				duration_ms: durationMs,
				created_at: new Date(endedAtMs).toISOString(),
			});

			console.info(
				JSON.stringify({
					event: "token_cleanup_scheduled",
					status: "success",
					requestId,
					startedAt,
					endedAt: new Date(endedAtMs).toISOString(),
					durationMs,
					cron: cronMetadata.cron,
					scheduledTime: cronMetadata.scheduledTime,
					accessTokensDeleted: result.accessTokensDeleted,
					refreshTokensExpiredDeleted: result.refreshTokensExpiredDeleted,
					refreshTokensRevokedDeleted: result.refreshTokensRevokedDeleted,
					authorizationCodesDeleted: result.authorizationCodesDeleted,
					totalDeleted: result.totalDeleted,
					tokenActivityLogDeleted,
				})
			);
		} catch (error) {
			const endedAtMs = Date.now();
			console.error(
				JSON.stringify({
					event: "token_cleanup_scheduled",
					status: "error",
					requestId,
					startedAt,
					endedAt: new Date(endedAtMs).toISOString(),
					durationMs: endedAtMs - startedAtMs,
					cron: cronMetadata.cron,
					scheduledTime: cronMetadata.scheduledTime,
					error: toErrorDetails(error),
				})
			);
			throw error;
		}
	},
};

export default worker;
