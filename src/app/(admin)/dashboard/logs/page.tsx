"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, ListTodo, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { listTokenActivityLogs } from "@/app/actions/token-activity-actions";
import { listEnvironments } from "@/app/actions/environment-actions";
import type {
	TokenActivityLogRow,
	TokenActivityRequestType,
	TokenActivityLogOrderBy,
	ListLogsParams,
} from "@/lib/repositories/token-activity-log.repository";
import type { Environment } from "@/lib/repositories/environment.repository";

const PAGE_SIZE = 50;
const REQUEST_TYPES: { value: TokenActivityRequestType; label: string }[] = [
	{ value: "authorize", label: "Authorize" },
	{ value: "token", label: "Token" },
	{ value: "validate", label: "Validate" },
];

function formatMs(ms: number | null): string {
	if (ms == null) return "—";
	return `${ms} ms`;
}

function formatDate(iso: string): string {
	return new Date(iso).toLocaleString();
}

export default function LogsPage() {
	const [rows, setRows] = useState<TokenActivityLogRow[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [environments, setEnvironments] = useState<Environment[]>([]);

	const [filters, setFilters] = useState<{
		requestType: TokenActivityRequestType | "";
		environmentName: string;
		succeeded: "" | "yes" | "no";
		sinceIso: string;
		untilIso: string;
	}>({
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
		if (filters.environmentName)
			params.environmentName = filters.environmentName;
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

	const SortIcon = ({ column }: { column: TokenActivityLogOrderBy }) => {
		if (orderBy !== column) {
			return <ArrowUpDown className="ml-1 inline h-3.5 w-3.5 opacity-50" />;
		}
		return orderDir === "asc" ? (
			<ArrowUp className="ml-1 inline h-3.5 w-3.5" />
		) : (
			<ArrowDown className="ml-1 inline h-3.5 w-3.5" />
		);
	};

	const totalPages = Math.ceil(total / PAGE_SIZE);

	return (
		<main className="min-h-screen bg-background p-6 text-foreground">
			<div className="mb-6 flex items-center gap-2 text-xl font-semibold">
				<ListTodo className="h-6 w-6" />
				Token activity logs
			</div>

			{error && (
				<p className="mb-4 rounded-xl bg-red-950/50 px-3 py-2 text-sm text-red-200">
					{error}
				</p>
			)}

			<div className="mb-4 flex flex-wrap items-end gap-4 rounded-xl border border-brand-muted bg-brand-muted/10 p-4">
				<div>
					<label className="mb-1 block text-xs text-muted-foreground">
						Request type
					</label>
					<select
						value={filters.requestType}
						onChange={(e) => {
							setFilters((f) => ({
								...f,
								requestType: e.target.value as TokenActivityRequestType | "",
							}));
							setPage(0);
						}}
						className="rounded-lg border border-brand-muted bg-background px-2 py-1.5 text-sm"
					>
						<option value="">All</option>
						{REQUEST_TYPES.map((t) => (
							<option key={t.value} value={t.value}>
								{t.label}
							</option>
						))}
					</select>
				</div>
				<div>
					<label className="mb-1 block text-xs text-muted-foreground">
						Environment
					</label>
					<select
						value={filters.environmentName}
						onChange={(e) => {
							setFilters((f) => ({ ...f, environmentName: e.target.value }));
							setPage(0);
						}}
						className="rounded-lg border border-brand-muted bg-background px-2 py-1.5 text-sm"
					>
						<option value="">All</option>
						{environments.map((env) => (
							<option key={env.id} value={env.name}>
								{env.name}
							</option>
						))}
					</select>
				</div>
				<div>
					<label className="mb-1 block text-xs text-muted-foreground">
						Success
					</label>
					<select
						value={filters.succeeded}
						onChange={(e) => {
							setFilters((f) => ({
								...f,
								succeeded: e.target.value as "" | "yes" | "no",
							}));
							setPage(0);
						}}
						className="rounded-lg border border-brand-muted bg-background px-2 py-1.5 text-sm"
					>
						<option value="">All</option>
						<option value="yes">Yes</option>
						<option value="no">No</option>
					</select>
				</div>
				<div>
					<label className="mb-1 block text-xs text-muted-foreground">
						From (date)
					</label>
					<input
						type="date"
						value={filters.sinceIso ? filters.sinceIso.slice(0, 10) : ""}
						onChange={(e) => {
							setFilters((f) => ({
								...f,
								sinceIso: e.target.value ? `${e.target.value}T00:00:00.000Z` : "",
							}));
							setPage(0);
						}}
						className="rounded-lg border border-brand-muted bg-background px-2 py-1.5 text-sm"
					/>
				</div>
				<div>
					<label className="mb-1 block text-xs text-muted-foreground">
						To (date)
					</label>
					<input
						type="date"
						value={filters.untilIso ? filters.untilIso.slice(0, 10) : ""}
						onChange={(e) => {
							setFilters((f) => ({
								...f,
								untilIso: e.target.value
									? `${e.target.value}T23:59:59.999Z`
									: "",
							}));
							setPage(0);
						}}
						className="rounded-lg border border-brand-muted bg-background px-2 py-1.5 text-sm"
					/>
				</div>
				<button
					type="button"
					onClick={() => setPage(0)}
					className="rounded-lg border border-brand-muted bg-background px-3 py-1.5 text-sm font-medium hover:bg-brand-muted/30"
				>
					Apply filters
				</button>
			</div>

			<div className="overflow-x-auto rounded-xl border border-brand-muted">
				<table className="w-full min-w-[800px] text-left text-sm">
					<thead>
						<tr className="border-b border-brand-muted bg-brand-muted/20">
							<th className="px-4 py-3 font-medium">
								<button
									type="button"
									onClick={() => handleSort("request_type")}
									className="flex items-center hover:underline"
								>
									Type
									<SortIcon column="request_type" />
								</button>
							</th>
							<th className="px-4 py-3 font-medium">
								<button
									type="button"
									onClick={() => handleSort("ip_address")}
									className="flex items-center hover:underline"
								>
									IP
									<SortIcon column="ip_address" />
								</button>
							</th>
							<th className="px-4 py-3 font-medium">
								<button
									type="button"
									onClick={() => handleSort("environment_name")}
									className="flex items-center hover:underline"
								>
									Environment
									<SortIcon column="environment_name" />
								</button>
							</th>
							<th className="px-4 py-3 font-medium">
								<button
									type="button"
									onClick={() => handleSort("succeeded")}
									className="flex items-center hover:underline"
								>
									Success
									<SortIcon column="succeeded" />
								</button>
							</th>
							<th className="px-4 py-3 font-medium">
								<button
									type="button"
									onClick={() => handleSort("duration_ms")}
									className="flex items-center hover:underline"
								>
									Duration
									<SortIcon column="duration_ms" />
								</button>
							</th>
							<th className="px-4 py-3 font-medium">
								<button
									type="button"
									onClick={() => handleSort("created_at")}
									className="flex items-center hover:underline"
								>
									Time
									<SortIcon column="created_at" />
								</button>
							</th>
						</tr>
					</thead>
					<tbody>
						{loading ? (
							<tr>
								<td colSpan={6} className="px-4 py-8 text-center">
									<Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
								</td>
							</tr>
						) : rows.length === 0 ? (
							<tr>
								<td
									colSpan={6}
									className="px-4 py-8 text-center text-muted-foreground"
								>
									No logs match the filters.
								</td>
							</tr>
						) : (
							rows.map((row) => (
								<tr
									key={row.id}
									className="border-b border-brand-muted/50"
								>
									<td className="px-4 py-2 uppercase">{row.request_type}</td>
									<td className="px-4 py-2 font-mono text-xs">
										{row.ip_address ?? "—"}
									</td>
									<td className="px-4 py-2">
										{row.environment_name ?? "—"}
									</td>
									<td className="px-4 py-2">
										{row.succeeded ? (
											<span className="text-green-600">Yes</span>
										) : (
											<span className="text-red-600">No</span>
										)}
									</td>
									<td className="px-4 py-2 font-mono text-xs">
										{formatMs(row.duration_ms)}
									</td>
									<td className="px-4 py-2 font-mono text-xs">
										{formatDate(row.created_at)}
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>

			{total > PAGE_SIZE && (
				<div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
					<span>
						Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)}{" "}
						of {total}
					</span>
					<div className="flex gap-2">
						<button
							type="button"
							onClick={() => setPage((p) => Math.max(0, p - 1))}
							disabled={page === 0}
							className="rounded border border-brand-muted px-2 py-1 disabled:opacity-50 hover:bg-brand-muted/30"
						>
							Previous
						</button>
						<button
							type="button"
							onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
							disabled={page >= totalPages - 1}
							className="rounded border border-brand-muted px-2 py-1 disabled:opacity-50 hover:bg-brand-muted/30"
						>
							Next
						</button>
					</div>
				</div>
			)}
		</main>
	);
}
