"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, ClipboardList, ChevronDown, ChevronRight } from "lucide-react";
import { listAdminAuditLogs } from "@/app/actions/admin-audit-log-actions";
import type {
	AdminAuditLogListEntry,
	ListAdminAuditLogParams,
} from "@/lib/repositories/admin-audit-log.repository";

const PAGE_SIZE = 50;

function formatDate(iso: string): string {
	return new Date(iso).toLocaleString();
}

function formatDetails(raw: string | null): string | null {
	if (!raw) return null;
	try {
		return JSON.stringify(JSON.parse(raw), null, 2);
	} catch {
		return raw;
	}
}

function DetailsCell({ raw }: { raw: string | null }) {
	const [open, setOpen] = useState(false);
	const pretty = formatDetails(raw);
	if (!pretty) return <span className="text-muted-foreground">—</span>;
	return (
		<div className="flex flex-col gap-1">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
			>
				{open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
				{open ? "Hide" : "Show"}
			</button>
			{open && (
				<pre className="max-w-md overflow-x-auto rounded-lg border border-brand-muted bg-brand-muted/10 p-2 font-mono text-xs">
					{pretty}
				</pre>
			)}
		</div>
	);
}

export default function AuditLogPage() {
	const [rows, setRows] = useState<AdminAuditLogListEntry[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const [filters, setFilters] = useState<{
		action: string;
		resourceType: string;
		resourceId: string;
		actorUserId: string;
		sinceIso: string;
		untilIso: string;
	}>({
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
				<p className="mb-4 shrink-0 rounded-xl bg-red-950/50 px-3 py-2 text-sm text-red-200">
					{error}
				</p>
			)}

			<div className="mb-4 flex shrink-0 flex-wrap items-end gap-4 rounded-xl border border-brand-muted bg-brand-muted/10 p-4">
				<div>
					<label className="mb-1 block text-xs text-muted-foreground">Action contains</label>
					<input
						type="text"
						value={filters.action}
						placeholder="user.delete"
						onChange={(e) => {
							setFilters((f) => ({ ...f, action: e.target.value }));
							setPage(0);
						}}
						className="rounded-lg border border-brand-muted bg-background px-2 py-1.5 text-sm"
					/>
				</div>
				<div>
					<label className="mb-1 block text-xs text-muted-foreground">Resource type</label>
					<input
						type="text"
						value={filters.resourceType}
						placeholder="user"
						onChange={(e) => {
							setFilters((f) => ({ ...f, resourceType: e.target.value }));
							setPage(0);
						}}
						className="rounded-lg border border-brand-muted bg-background px-2 py-1.5 text-sm"
					/>
				</div>
				<div>
					<label className="mb-1 block text-xs text-muted-foreground">Resource id</label>
					<input
						type="text"
						value={filters.resourceId}
						onChange={(e) => {
							setFilters((f) => ({ ...f, resourceId: e.target.value }));
							setPage(0);
						}}
						className="rounded-lg border border-brand-muted bg-background px-2 py-1.5 text-sm"
					/>
				</div>
				<div>
					<label className="mb-1 block text-xs text-muted-foreground">Actor user id</label>
					<input
						type="text"
						value={filters.actorUserId}
						onChange={(e) => {
							setFilters((f) => ({ ...f, actorUserId: e.target.value }));
							setPage(0);
						}}
						className="rounded-lg border border-brand-muted bg-background px-2 py-1.5 text-sm"
					/>
				</div>
				<div>
					<label className="mb-1 block text-xs text-muted-foreground">From (date)</label>
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
					<label className="mb-1 block text-xs text-muted-foreground">To (date)</label>
					<input
						type="date"
						value={filters.untilIso ? filters.untilIso.slice(0, 10) : ""}
						onChange={(e) => {
							setFilters((f) => ({
								...f,
								untilIso: e.target.value ? `${e.target.value}T23:59:59.999Z` : "",
							}));
							setPage(0);
						}}
						className="rounded-lg border border-brand-muted bg-background px-2 py-1.5 text-sm"
					/>
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-auto rounded-xl border border-brand-muted">
				<table className="w-full min-w-[900px] text-left text-sm">
					<thead>
						<tr className="border-b border-brand-muted bg-brand-muted/20">
							<th className="px-4 py-3 font-medium">Time</th>
							<th className="px-4 py-3 font-medium">Actor</th>
							<th className="px-4 py-3 font-medium">Action</th>
							<th className="px-4 py-3 font-medium">Resource</th>
							<th className="px-4 py-3 font-medium">Details</th>
						</tr>
					</thead>
					<tbody>
						{loading ? (
							<tr>
								<td colSpan={5} className="px-4 py-8 text-center">
									<Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
								</td>
							</tr>
						) : rows.length === 0 ? (
							<tr>
								<td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
									No audit entries match the filters.
								</td>
							</tr>
						) : (
							rows.map((row) => (
								<tr key={row.id} className="border-b border-brand-muted/50 align-top">
									<td className="px-4 py-2 font-mono text-xs">{formatDate(row.created_at)}</td>
									<td className="px-4 py-2">
										{row.actor_username ? (
											<span>{row.actor_username}</span>
										) : row.actor_user_id ? (
											<span className="font-mono text-xs text-muted-foreground">
												{row.actor_user_id}
											</span>
										) : (
											<span className="text-muted-foreground">—</span>
										)}
									</td>
									<td className="px-4 py-2 font-mono text-xs">{row.action}</td>
									<td className="px-4 py-2">
										<div className="flex flex-col">
											<span>{row.resource_type}</span>
											{row.resource_id && (
												<span className="font-mono text-xs text-muted-foreground">
													{row.resource_id}
												</span>
											)}
										</div>
									</td>
									<td className="px-4 py-2">
										<DetailsCell raw={row.details} />
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>

			{total > PAGE_SIZE && (
				<div className="mt-4 flex shrink-0 items-center justify-between text-sm text-muted-foreground">
					<span>
						Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
					</span>
					<div className="flex gap-2">
						<button
							type="button"
							onClick={() => setPage((p) => Math.max(0, p - 1))}
							disabled={page === 0}
							className="rounded border border-brand-muted px-2 py-1 hover:bg-brand-muted/30 disabled:opacity-50"
						>
							Previous
						</button>
						<button
							type="button"
							onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
							disabled={page >= totalPages - 1}
							className="rounded border border-brand-muted px-2 py-1 hover:bg-brand-muted/30 disabled:opacity-50"
						>
							Next
						</button>
					</div>
				</div>
			)}
		</main>
	);
}
