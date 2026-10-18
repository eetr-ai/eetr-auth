"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Banner, PageHeader } from "@/components/ui";

const PAGE_SIZE = 50;

interface LogsResult {
	/** The query this result answers; a mismatch with the current one means a fetch is in flight. */
	params: ListLogsParams;
	rows: TokenActivityLogRow[];
	total: number;
	error: string | null;
}

export default function LogsPage() {
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
	const [result, setResult] = useState<LogsResult | null>(null);

	const params = useMemo(() => {
		const ret: ListLogsParams = {
			limit: PAGE_SIZE,
			offset: page * PAGE_SIZE,
			orderBy,
			orderDir,
		};
		if (filters.requestType) ret.requestType = filters.requestType;
		if (filters.environmentName) ret.environmentName = filters.environmentName;
		if (filters.succeeded === "yes") ret.succeeded = true;
		if (filters.succeeded === "no") ret.succeeded = false;
		if (filters.sinceIso) ret.sinceIso = filters.sinceIso;
		if (filters.untilIso) ret.untilIso = filters.untilIso;
		return ret;
	}, [page, orderBy, orderDir, filters]);

	useEffect(() => {
		listEnvironments().then(setEnvironments);
	}, []);

	// The effect only writes state once the fetch settles, and a response for a query
	// the admin has already moved past is dropped rather than painted over the newer one.
	useEffect(() => {
		let cancelled = false;
		listTokenActivityLogs(params)
			.then(
				(res) => ({ params, rows: res.rows, total: res.total, error: null }),
				(err: unknown) => ({
					params,
					rows: [],
					total: 0,
					error: err instanceof Error ? err.message : "Failed to load logs",
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
			<PageHeader icon={ListTodo} title="Token activity logs" />

			<Banner variant="error" message={error} className="shrink-0" />

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
