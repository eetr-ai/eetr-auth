import type { ClientRepository } from "@/lib/repositories/client.repository";
import type { EnvironmentRepository } from "@/lib/repositories/environment.repository";
import type {
	TokenActivityLogRow,
	TokenActivityMetrics,
	TokenActivityRequestType,
	ListLogsParams,
	ListLogsResult,
	TokenActivityLogRepository,
} from "@/lib/repositories/token-activity-log.repository";

export interface LogActivityParams {
	ip: string | null;
	requestType: TokenActivityRequestType;
	succeeded: boolean;
	environmentName?: string | null;
	clientId?: string | null;
	durationMs?: number | null;
}

export interface TokenActivityLogServiceDependencies {
	logRepo: TokenActivityLogRepository;
	clientRepo: ClientRepository;
	envRepo: EnvironmentRepository;
}

export class TokenActivityLogService {
	private readonly logRepo: TokenActivityLogRepository;
	private readonly clientRepo: ClientRepository;
	private readonly envRepo: EnvironmentRepository;

	constructor({ logRepo, clientRepo, envRepo }: TokenActivityLogServiceDependencies) {
		this.logRepo = logRepo;
		this.clientRepo = clientRepo;
		this.envRepo = envRepo;
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
