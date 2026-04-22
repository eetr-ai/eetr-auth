import type {
	AdminAuditLogListEntry,
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
			conditions.push("a.actor_user_id = ?");
			bindValues.push(params.actorUserId);
		}
		if (params.action != null && params.action !== "") {
			conditions.push("a.action LIKE ?");
			bindValues.push(`%${params.action}%`);
		}
		if (params.resourceType != null && params.resourceType !== "") {
			conditions.push("a.resource_type = ?");
			bindValues.push(params.resourceType);
		}
		if (params.resourceId != null && params.resourceId !== "") {
			conditions.push("a.resource_id = ?");
			bindValues.push(params.resourceId);
		}
		if (params.sinceIso != null && params.sinceIso !== "") {
			conditions.push("a.created_at >= ?");
			bindValues.push(params.sinceIso);
		}
		if (params.untilIso != null && params.untilIso !== "") {
			conditions.push("a.created_at <= ?");
			bindValues.push(params.untilIso);
		}

		const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
		const limit = Math.min(Math.max(params.limit ?? 100, 1), 1000);
		const offset = Math.max(params.offset ?? 0, 0);

		const countResult = await this.db
			.prepare(`SELECT COUNT(*) as total FROM admin_audit_log a ${whereClause}`)
			.bind(...bindValues)
			.first<{ total: number }>();
		const total = countResult?.total ?? 0;

		const rowsResult = await this.db
			.prepare(
				`SELECT a.id, a.actor_user_id, a.action, a.resource_type, a.resource_id, a.details, a.created_at,
				        u.username AS actor_username
				 FROM admin_audit_log a
				 LEFT JOIN users u ON u.id = a.actor_user_id
				 ${whereClause}
				 ORDER BY a.created_at DESC
				 LIMIT ? OFFSET ?`
			)
			.bind(...bindValues, limit, offset)
			.all<AdminAuditLogListEntry>();

		return { rows: rowsResult.results ?? [], total };
	}
}
