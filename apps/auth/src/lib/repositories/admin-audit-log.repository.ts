export interface AdminAuditLogRow {
	id: string;
	actor_user_id: string | null;
	action: string;
	resource_type: string;
	resource_id: string | null;
	details: string | null;
	created_at: string;
}

export interface ListAdminAuditLogParams {
	actorUserId?: string | null;
	action?: string | null;
	resourceType?: string | null;
	resourceId?: string | null;
	sinceIso?: string | null;
	untilIso?: string | null;
	limit?: number;
	offset?: number;
}

export interface AdminAuditLogListEntry extends AdminAuditLogRow {
	actor_username: string | null;
}

export interface ListAdminAuditLogResult {
	rows: AdminAuditLogListEntry[];
	total: number;
}

export interface AdminAuditLogRepository {
	insert(row: AdminAuditLogRow): Promise<void>;
	listLogs(params: ListAdminAuditLogParams): Promise<ListAdminAuditLogResult>;
}
