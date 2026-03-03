import type {
	TokenActivityLogRepository,
	TokenActivityLogRow,
	TokenActivityMetrics,
	TokenActivityRequestType,
	ListLogsParams,
	ListLogsResult,
	TokenActivityLogOrderBy,
} from "./token-activity-log.repository";

const ORDER_BY_COLUMNS: Record<TokenActivityLogOrderBy, string> = {
	created_at: "created_at",
	duration_ms: "duration_ms",
	request_type: "request_type",
	environment_name: "environment_name",
	ip_address: "ip_address",
	succeeded: "succeeded",
};

export class TokenActivityLogRepositoryD1 implements TokenActivityLogRepository {
	constructor(private readonly db: D1Database) {}

	async insert(row: TokenActivityLogRow): Promise<void> {
		await this.db
			.prepare(
				"INSERT INTO token_activity_log (id, ip_address, request_type, succeeded, environment_name, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
			)
			.bind(
				row.id,
				row.ip_address ?? null,
				row.request_type,
				row.succeeded,
				row.environment_name ?? null,
				row.duration_ms ?? null,
				row.created_at
			)
			.run();
	}

	async deleteOlderThan(createdBeforeIso: string): Promise<number> {
		const result = await this.db
			.prepare("DELETE FROM token_activity_log WHERE created_at < ?")
			.bind(createdBeforeIso)
			.run();
		return result.meta?.changes ?? 0;
	}

	async getMetricsSince(sinceIso: string): Promise<TokenActivityMetrics> {
		const nowIso = new Date().toISOString();

		const [overallAvg, avgByType, byEnvRows, byDayRows] = await Promise.all([
			this.db
				.prepare(
					"SELECT AVG(duration_ms) as avg_ms FROM token_activity_log WHERE created_at >= ? AND duration_ms IS NOT NULL"
				)
				.bind(sinceIso)
				.first<{ avg_ms: number | null }>(),
			this.db
				.prepare(
					"SELECT request_type, AVG(duration_ms) as avg_ms FROM token_activity_log WHERE created_at >= ? AND duration_ms IS NOT NULL GROUP BY request_type"
				)
				.bind(sinceIso)
				.all<{ request_type: TokenActivityRequestType; avg_ms: number }>(),
			this.db
				.prepare(
					"SELECT COALESCE(environment_name, '') as env, request_type, COUNT(*) as cnt, SUM(succeeded) as success_cnt FROM token_activity_log WHERE created_at >= ? GROUP BY env, request_type"
				)
				.bind(sinceIso)
				.all<{ env: string; request_type: TokenActivityRequestType; cnt: number; success_cnt: number }>(),
			this.db
				.prepare(
					"SELECT date(created_at) as d, COALESCE(environment_name, '') as env, request_type, COUNT(*) as cnt FROM token_activity_log WHERE created_at >= ? GROUP BY d, env, request_type"
				)
				.bind(sinceIso)
				.all<{ d: string; env: string; request_type: TokenActivityRequestType; cnt: number }>(),
		]);

		const avgDurationMsByType: TokenActivityMetrics["avgDurationMsByType"] = {
			authorize: null,
			token: null,
			validate: null,
		};
		for (const row of avgByType.results ?? []) {
			avgDurationMsByType[row.request_type] = row.avg_ms;
		}

		const byEnvironment: TokenActivityMetrics["byEnvironment"] = {};
		for (const row of byEnvRows.results ?? []) {
			const env = row.env || "(unknown)";
			if (!byEnvironment[env]) {
				byEnvironment[env] = {
					totalAuth: 0,
					totalToken: 0,
					totalValidate: 0,
					successCount: 0,
					totalCount: 0,
				};
			}
			const rec = byEnvironment[env];
			rec.totalCount += row.cnt;
			rec.successCount += row.success_cnt ?? 0;
			if (row.request_type === "authorize") rec.totalAuth += row.cnt;
			else if (row.request_type === "token") rec.totalToken += row.cnt;
			else if (row.request_type === "validate") rec.totalValidate += row.cnt;
		}

		const dayMap = new Map<string, Record<string, { authorize: number; token: number; validate: number }>>();
		for (const row of byDayRows.results ?? []) {
			const env = row.env || "(unknown)";
			let dayRec = dayMap.get(row.d);
			if (!dayRec) {
				dayRec = {};
				dayMap.set(row.d, dayRec);
			}
			if (!dayRec[env]) {
				dayRec[env] = { authorize: 0, token: 0, validate: 0 };
			}
			dayRec[env][row.request_type] = row.cnt;
		}
		const byDay = Array.from(dayMap.entries())
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([date, byEnvironment]) => ({ date, byEnvironment }));

		return {
			from: sinceIso,
			to: nowIso,
			overallAvgDurationMs: overallAvg?.avg_ms ?? null,
			avgDurationMsByType,
			byEnvironment,
			byDay,
		};
	}

	async listLogs(params: ListLogsParams): Promise<ListLogsResult> {
		const conditions: string[] = [];
		const bindValues: (string | number)[] = [];

		if (params.sinceIso != null && params.sinceIso !== "") {
			conditions.push("created_at >= ?");
			bindValues.push(params.sinceIso);
		}
		if (params.untilIso != null && params.untilIso !== "") {
			conditions.push("created_at <= ?");
			bindValues.push(params.untilIso);
		}
		if (params.requestType != null && params.requestType !== "") {
			conditions.push("request_type = ?");
			bindValues.push(params.requestType);
		}
		if (params.environmentName != null && params.environmentName !== "") {
			conditions.push("environment_name = ?");
			bindValues.push(params.environmentName);
		}
		if (params.succeeded === true) {
			conditions.push("succeeded = 1");
		} else if (params.succeeded === false) {
			conditions.push("succeeded = 0");
		}

		const whereClause =
			conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
		const orderBy =
			params.orderBy && ORDER_BY_COLUMNS[params.orderBy]
				? `ORDER BY ${ORDER_BY_COLUMNS[params.orderBy]} ${params.orderDir === "desc" ? "DESC" : "ASC"}`
				: "ORDER BY created_at DESC";
		const limit = Math.min(Math.max(params.limit ?? 100, 1), 1000);
		const offset = Math.max(params.offset ?? 0, 0);

		const countResult = await this.db
			.prepare(
				`SELECT COUNT(*) as total FROM token_activity_log ${whereClause}`
			)
			.bind(...bindValues)
			.first<{ total: number }>();

		const total = countResult?.total ?? 0;

		const rowsResult = await this.db
			.prepare(
				`SELECT id, ip_address, request_type, succeeded, environment_name, duration_ms, created_at FROM token_activity_log ${whereClause} ${orderBy} LIMIT ? OFFSET ?`
			)
			.bind(...bindValues, limit, offset)
			.all<{
					id: string;
					ip_address: string | null;
					request_type: TokenActivityRequestType;
					succeeded: number;
					environment_name: string | null;
					duration_ms: number | null;
					created_at: string;
				}>();

		const rows: TokenActivityLogRow[] = (rowsResult.results ?? []).map(
			(r) => ({
				id: r.id,
				ip_address: r.ip_address,
				request_type: r.request_type,
				succeeded: r.succeeded,
				environment_name: r.environment_name,
				duration_ms: r.duration_ms,
				created_at: r.created_at,
			})
		);

		return { rows, total };
	}
}
