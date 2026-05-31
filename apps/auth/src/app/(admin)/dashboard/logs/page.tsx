"use client";

import { useCallback, useEffect, useState } from "react";
import { ListTodo } from "lucide-react";
import { listTokenActivityLogs } from "@/app/actions/token-activity-actions";
import { listEnvironments } from "@/app/actions/environment-actions";
import type {
	TokenActivityLogRow,
	TokenActivityLogOrderBy,
	ListLogsParams,
} from "@/lib/repositories/token-activity-log.repository";
import type { Environment } from "@/lib/repositories/environment.repository";
import { LogsFilters, type LogsFiltersState } from "./_components/logs-filters";
import { LogsTable } from "./_components/logs-table";
import { LogsPagination } from "./_components/logs-pagination";

const PAGE_SIZE = 50;

export default function LogsPage() {
	const [rows, setRows] = useState<TokenActivityLogRow[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [environments, setEnvironments] = useState<Environment[]>([]);

	const [filters, setFilters] = useState<LogsFiltersState>({
		requestType: "",
		environmentName: "",
		succeeded: "",
		sinceIso: "",
		untilIso: "",
	});
	const [orderBy, setOrderBy] = useState<TokenActivityLogOrderBy>("created_at");
	const [orderDir, setOrderDir] = useState<"asc" | "desc">("desc");
	const [page, setPage] = useState(0);

	const loadLogs = useCallback(async () => {
		setLoading(true);
		setError(null);
		const params: ListLogsParams = {
			limit: PAGE_SIZE,
			offset: page * PAGE_SIZE,
			orderBy,
			orderDir,
		};
		if (filters.requestType) params.requestType = filters.requestType;
		if (filters.environmentName) params.environmentName = filters.environmentName;
		if (filters.succeeded === "yes") params.succeeded = true;
		if (filters.succeeded === "no") params.succeeded = false;
		if (filters.sinceIso) params.sinceIso = filters.sinceIso;
		if (filters.untilIso) params.untilIso = filters.untilIso;

		try {
			const result = await listTokenActivityLogs(params);
			setRows(result.rows);
			setTotal(result.total);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load logs");
			setRows([]);
			setTotal(0);
		} finally {
			setLoading(false);
		}
	}, [page, orderBy, orderDir, filters]);

	useEffect(() => {
		listEnvironments().then(setEnvironments);
	}, []);

	useEffect(() => {
		loadLogs();
	}, [loadLogs]);

	const handleSort = (column: TokenActivityLogOrderBy) => {
		if (orderBy === column) {
			setOrderDir((d) => (d === "asc" ? "desc" : "asc"));
		} else {
			setOrderBy(column);
			setOrderDir("desc");
		}
		setPage(0);
	};

	const totalPages = Math.ceil(total / PAGE_SIZE);

	return (
		<main className="flex h-screen flex-col bg-background p-6 text-foreground">
			<div className="mb-6 flex shrink-0 items-center gap-2 text-xl font-semibold">
				<ListTodo className="h-6 w-6" />
				Token activity logs
			</div>

			{error && (
				<p className="mb-4 shrink-0 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-200">
					{error}
				</p>
			)}

			<LogsFilters
				filters={filters}
				environments={environments}
				onChange={setFilters}
				onApply={() => setPage(0)}
			/>

			<LogsTable
				rows={rows}
				loading={loading}
				orderBy={orderBy}
				orderDir={orderDir}
				onSort={handleSort}
			/>

			{total > PAGE_SIZE && (
				<LogsPagination
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
