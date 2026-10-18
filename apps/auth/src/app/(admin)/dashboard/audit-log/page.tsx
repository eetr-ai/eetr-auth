"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Banner, PageHeader } from "@/components/ui";

const PAGE_SIZE = 50;

interface AuditLogResult {
	/** The query this result answers; a mismatch with the current one means a fetch is in flight. */
	params: ListAdminAuditLogParams;
	rows: AdminAuditLogListEntry[];
	total: number;
	error: string | null;
}

export default function AuditLogPage() {
	const [filters, setFilters] = useState<AuditLogFilterValues>({
		action: "",
		resourceType: "",
		resourceId: "",
		actorUserId: "",
		sinceIso: "",
		untilIso: "",
	});
	const [page, setPage] = useState(0);
	const [result, setResult] = useState<AuditLogResult | null>(null);

	const params = useMemo(() => {
		const ret: ListAdminAuditLogParams = {
			limit: PAGE_SIZE,
			offset: page * PAGE_SIZE,
		};
		if (filters.action) ret.action = filters.action;
		if (filters.resourceType) ret.resourceType = filters.resourceType;
		if (filters.resourceId) ret.resourceId = filters.resourceId;
		if (filters.actorUserId) ret.actorUserId = filters.actorUserId;
		if (filters.sinceIso) ret.sinceIso = filters.sinceIso;
		if (filters.untilIso) ret.untilIso = filters.untilIso;
		return ret;
	}, [page, filters]);

	// The effect only writes state once the fetch settles, and a response for a query
	// the admin has already moved past is dropped rather than painted over the newer one.
	useEffect(() => {
		let cancelled = false;
		listAdminAuditLogs(params)
			.then(
				(res) => ({ params, rows: res.rows, total: res.total, error: null }),
				(err: unknown) => ({
					params,
					rows: [],
					total: 0,
					error: err instanceof Error ? err.message : "Failed to load audit log",
				}),
			)
			.then((next) => {
				if (!cancelled) setResult(next);
			});
		return () => {
			cancelled = true;
		};
	}, [params]);

	// The previous page stays on screen while the next one loads, as it did before.
	const loading = result?.params !== params;
	const rows = result?.rows ?? [];
	const total = result?.total ?? 0;
	const error = loading ? null : (result?.error ?? null);

	const totalPages = Math.ceil(total / PAGE_SIZE);

	return (
		<main className="flex h-screen flex-col bg-background p-6 text-foreground">
			<PageHeader icon={ClipboardList} title="Admin audit log" />

			<Banner variant="error" message={error} className="shrink-0" />

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
