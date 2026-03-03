"use server";

import { onServerAction } from "@/lib/context/on-server-action";
import type {
	TokenActivityMetrics,
	ListLogsParams,
	ListLogsResult,
} from "@/lib/repositories/token-activity-log.repository";

const DEFAULT_SINCE_DAYS = 7;

export async function getTokenActivityMetrics(
	sinceDays: number = DEFAULT_SINCE_DAYS
): Promise<TokenActivityMetrics> {
	return onServerAction(async (_ctx, getServices) => {
		const { tokenActivityLogService } = getServices();
		const sinceIso = new Date(
			Date.now() - sinceDays * 24 * 60 * 60 * 1000
		).toISOString();
		return tokenActivityLogService.getMetricsSince(sinceIso);
	});
}

export async function listTokenActivityLogs(
	params: ListLogsParams
): Promise<ListLogsResult> {
	return onServerAction(async (_ctx, getServices) => {
		const { tokenActivityLogService } = getServices();
		return tokenActivityLogService.listLogs(params);
	});
}
