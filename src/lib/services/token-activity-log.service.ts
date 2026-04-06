import { getDb } from "@/lib/db";
import type { RequestContext } from "@/lib/context/types";
import { TokenActivityLogRepositoryD1 } from "@/lib/repositories/token-activity-log.repository.d1";
import { ClientRepositoryD1 } from "@/lib/repositories/client.repository.d1";
import { EnvironmentRepositoryD1 } from "@/lib/repositories/environment.repository.d1";
import type {
	TokenActivityLogRow,
	TokenActivityMetrics,
	TokenActivityRequestType,
	ListLogsParams,
	ListLogsResult,
} from "@/lib/repositories/token-activity-log.repository";

export interface LogActivityParams {
	ip: string | null;
	requestType: TokenActivityRequestType;
	succeeded: boolean;
	environmentName?: string | null;
	clientId?: string | null;
	durationMs?: number | null;
}

export class TokenActivityLogService {
	private readonly logRepo: TokenActivityLogRepositoryD1;
	private readonly clientRepo: ClientRepositoryD1;
	private readonly envRepo: EnvironmentRepositoryD1;

	constructor(ctx: RequestContext) {
		const db = getDb(ctx.env);
		this.logRepo = new TokenActivityLogRepositoryD1(db);
		this.clientRepo = new ClientRepositoryD1(db);
		this.envRepo = new EnvironmentRepositoryD1(db);
	}

	async logActivity(params: LogActivityParams): Promise<void> {
		let environmentName: string | null = params.environmentName ?? null;
		if (environmentName == null && params.clientId?.trim()) {
			const clientId = params.clientId.trim();
			const client =
				(await this.clientRepo.getByClientIdentifier(clientId)) ??
				(await this.clientRepo.getById(clientId));
			if (client) {
				const env = await this.envRepo.getById(client.environmentId);
				environmentName = env?.name ?? null;
			}
		}

		const row: TokenActivityLogRow = {
			id: crypto.randomUUID(),
			ip_address: params.ip,
			request_type: params.requestType,
			succeeded: params.succeeded ? 1 : 0,
			environment_name: environmentName,
			duration_ms: params.durationMs ?? null,
			created_at: new Date().toISOString(),
		};
		await this.logRepo.insert(row);
	}

	async getMetricsSince(sinceIso: string): Promise<TokenActivityMetrics> {
		return this.logRepo.getMetricsSince(sinceIso);
	}

	async listLogs(params: ListLogsParams): Promise<ListLogsResult> {
		return this.logRepo.listLogs(params);
	}
}
