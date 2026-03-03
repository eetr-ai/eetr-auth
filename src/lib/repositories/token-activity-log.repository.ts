export type TokenActivityRequestType = "authorize" | "token" | "validate";

export interface TokenActivityLogRow {
	id: string;
	ip_address: string | null;
	request_type: TokenActivityRequestType;
	succeeded: number;
	environment_name: string | null;
	duration_ms: number | null;
	created_at: string;
}

export interface TokenActivityMetrics {
	from: string;
	to: string;
	overallAvgDurationMs: number | null;
	avgDurationMsByType: {
		authorize: number | null;
		token: number | null;
		validate: number | null;
	};
	byEnvironment: Record<
		string,
		{
			totalAuth: number;
			totalToken: number;
			totalValidate: number;
			successCount: number;
			totalCount: number;
		}
	>;
	byDay: Array<{
		date: string;
		byEnvironment: Record<string, { authorize: number; token: number; validate: number }>;
	}>;
}

export type TokenActivityLogOrderBy =
	| "created_at"
	| "duration_ms"
	| "request_type"
	| "environment_name"
	| "ip_address"
	| "succeeded";

export interface ListLogsParams {
	sinceIso?: string | null;
	untilIso?: string | null;
	requestType?: TokenActivityRequestType | "" | null;
	environmentName?: string | null;
	succeeded?: boolean | null;
	limit?: number;
	offset?: number;
	orderBy?: TokenActivityLogOrderBy;
	orderDir?: "asc" | "desc";
}

export interface ListLogsResult {
	rows: TokenActivityLogRow[];
	total: number;
}

export interface TokenActivityLogRepository {
	insert(row: TokenActivityLogRow): Promise<void>;
	deleteOlderThan(createdBeforeIso: string): Promise<number>;
	getMetricsSince(sinceIso: string): Promise<TokenActivityMetrics>;
	listLogs(params: ListLogsParams): Promise<ListLogsResult>;
}
