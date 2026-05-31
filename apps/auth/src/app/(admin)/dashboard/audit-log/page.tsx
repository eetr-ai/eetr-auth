"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import { listAdminAuditLogs } from "@/app/actions/admin-audit-log-actions";
import type {
	AdminAuditLogListEntry,
	ListAdminAuditLogParams,
} from "@/lib/repositories/admin-audit-log.repository";
import {
	AuditLogFilters,
	type AuditLogFilterValues,
} from "./_components/audit-log-filters";
import { AuditLogTable } from "./_components/audit-log-table";
import { AuditLogPagination } from "./_components/audit-log-pagination";

const PAGE_SIZE = 50;

export default function AuditLogPage() {
	const [rows, setRows] = useState<AdminAuditLogListEntry[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const [filters, setFilters] = useState<AuditLogFilterValues>({
		action: "",
		resourceType: "",
		resourceId: "",
		actorUserId: "",
		sinceIso: "",
		untilIso: "",
	});
	const [page, setPage] = useState(0);

	const loadLogs = useCallback(async () => {
		setLoading(true);
		setError(null);
		const params: ListAdminAuditLogParams = {
			limit: PAGE_SIZE,
			offset: page * PAGE_SIZE,
		};
		if (filters.action) params.action = filters.action;
		if (filters.resourceType) params.resourceType = filters.resourceType;
		if (filters.resourceId) params.resourceId = filters.resourceId;
		if (filters.actorUserId) params.actorUserId = filters.actorUserId;
		if (filters.sinceIso) params.sinceIso = filters.sinceIso;
		if (filters.untilIso) params.untilIso = filters.untilIso;

		try {
			const result = await listAdminAuditLogs(params);
			setRows(result.rows);
			setTotal(result.total);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load audit log");
			setRows([]);
			setTotal(0);
		} finally {
			setLoading(false);
		}
	}, [page, filters]);

	useEffect(() => {
		loadLogs();
	}, [loadLogs]);

	const totalPages = Math.ceil(total / PAGE_SIZE);

	return (
		<main className="flex h-screen flex-col bg-background p-6 text-foreground">
			<div className="mb-6 flex shrink-0 items-center gap-2 text-xl font-semibold">
				<ClipboardList className="h-6 w-6" />
				Admin audit log
			</div>

			{error && (
				<p className="mb-4 shrink-0 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-200">
					{error}
				</p>
			)}

			<AuditLogFilters
				filters={filters}
				onChange={(next) => {
					setFilters(next);
					setPage(0);
				}}
			/>

			<AuditLogTable rows={rows} loading={loading} />

			{total > PAGE_SIZE && (
				<AuditLogPagination
					page={page}
					pageSize={PAGE_SIZE}
					total={total}
					totalPages={totalPages}
					onPrev={() => setPage((p) => Math.max(0, p - 1))}
					onNext={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
				/>
			)}
		</main>
	);
}
