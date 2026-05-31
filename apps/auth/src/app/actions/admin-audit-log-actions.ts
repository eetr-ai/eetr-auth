"use server";

import { onAdminServerAction } from "@/lib/context/on-server-action";
import type {
	ListAdminAuditLogParams,
	ListAdminAuditLogResult,
} from "@/lib/repositories/admin-audit-log.repository";

export async function listAdminAuditLogs(
	params: ListAdminAuditLogParams
): Promise<ListAdminAuditLogResult> {
	return onAdminServerAction(async (_ctx, getServices) => {
		const { adminAuditLogService } = getServices();
		return adminAuditLogService.listLogs(params);
	});
}
