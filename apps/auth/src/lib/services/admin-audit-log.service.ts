import type {
	AdminAuditLogRepository,
	AdminAuditLogRow,
	ListAdminAuditLogParams,
	ListAdminAuditLogResult,
} from "@/lib/repositories/admin-audit-log.repository";

export interface LogAdminActionParams {
	actorUserId: string | null;
	action: string;
	resourceType: string;
	resourceId?: string | null;
	details?: Record<string, unknown> | null;
}

export class AdminAuditLogService {
	private readonly logRepo: AdminAuditLogRepository;

	constructor({ logRepo }: { logRepo: AdminAuditLogRepository }) {
		this.logRepo = logRepo;
	}

	buildRow(params: LogAdminActionParams): AdminAuditLogRow {
		return {
			id: crypto.randomUUID(),
			actor_user_id: params.actorUserId,
			action: params.action,
			resource_type: params.resourceType,
			resource_id: params.resourceId ?? null,
			details: params.details ? JSON.stringify(params.details) : null,
			created_at: new Date().toISOString(),
		};
	}

	async logAction(params: LogAdminActionParams): Promise<void> {
		await this.logRepo.insert(this.buildRow(params));
	}

	async listLogs(params: ListAdminAuditLogParams): Promise<ListAdminAuditLogResult> {
		return this.logRepo.listLogs(params);
	}
}
