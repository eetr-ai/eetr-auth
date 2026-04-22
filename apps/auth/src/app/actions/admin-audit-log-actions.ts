"use server";

import { onServerAction } from "@/lib/context/on-server-action";
import type {
	ListAdminAuditLogParams,
	ListAdminAuditLogResult,
} from "@/lib/repositories/admin-audit-log.repository";

export async function listAdminAuditLogs(
	params: ListAdminAuditLogParams
): Promise<ListAdminAuditLogResult> {
	return onServerAction(async (_ctx, getServices) => {
		const { adminAuditLogService } = getServices();
		return adminAuditLogService.listLogs(params);
	});
}
