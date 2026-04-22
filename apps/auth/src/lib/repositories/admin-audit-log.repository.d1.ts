import type {
	AdminAuditLogRepository,
	AdminAuditLogRow,
	ListAdminAuditLogParams,
	ListAdminAuditLogResult,
} from "./admin-audit-log.repository";

export class AdminAuditLogRepositoryD1 implements AdminAuditLogRepository {
	constructor(private readonly db: D1Database) {}

	async insert(row: AdminAuditLogRow): Promise<void> {
		await this.prepareInsert(row).run();
	}

	prepareInsert(row: AdminAuditLogRow): D1PreparedStatement {
		return this.db
			.prepare(
				"INSERT INTO admin_audit_log (id, actor_user_id, action, resource_type, resource_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
			)
			.bind(
				row.id,
				row.actor_user_id,
				row.action,
				row.resource_type,
				row.resource_id,
				row.details,
				row.created_at
			);
	}

	async listLogs(params: ListAdminAuditLogParams): Promise<ListAdminAuditLogResult> {
		const conditions: string[] = [];
		const bindValues: (string | number)[] = [];

		if (params.actorUserId != null && params.actorUserId !== "") {
			conditions.push("actor_user_id = ?");
			bindValues.push(params.actorUserId);
		}
		if (params.resourceType != null && params.resourceType !== "") {
			conditions.push("resource_type = ?");
			bindValues.push(params.resourceType);
		}
		if (params.resourceId != null && params.resourceId !== "") {
			conditions.push("resource_id = ?");
			bindValues.push(params.resourceId);
		}
		if (params.sinceIso != null && params.sinceIso !== "") {
			conditions.push("created_at >= ?");
			bindValues.push(params.sinceIso);
		}
		if (params.untilIso != null && params.untilIso !== "") {
			conditions.push("created_at <= ?");
			bindValues.push(params.untilIso);
		}

		const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
		const limit = Math.min(Math.max(params.limit ?? 100, 1), 1000);
		const offset = Math.max(params.offset ?? 0, 0);

		const countResult = await this.db
			.prepare(`SELECT COUNT(*) as total FROM admin_audit_log ${whereClause}`)
			.bind(...bindValues)
			.first<{ total: number }>();
		const total = countResult?.total ?? 0;

		const rowsResult = await this.db
			.prepare(
				`SELECT id, actor_user_id, action, resource_type, resource_id, details, created_at FROM admin_audit_log ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
			)
			.bind(...bindValues, limit, offset)
			.all<AdminAuditLogRow>();

		return { rows: rowsResult.results ?? [], total };
	}
}
