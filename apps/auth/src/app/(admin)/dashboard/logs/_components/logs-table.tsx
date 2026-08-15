import { Loader2, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import type {
	TokenActivityLogRow,
	TokenActivityLogOrderBy,
} from "@/lib/repositories/token-activity-log.repository";

function formatMs(ms: number | null): string {
	if (ms == null) return "—";
	return `${ms} ms`;
}

function formatDate(iso: string): string {
	return new Date(iso).toLocaleString();
}

const COLUMNS: { column: TokenActivityLogOrderBy; label: string }[] = [
	{ column: "request_type", label: "Type" },
	{ column: "ip_address", label: "IP" },
	{ column: "environment_name", label: "Environment" },
	{ column: "succeeded", label: "Success" },
	{ column: "duration_ms", label: "Duration" },
	{ column: "created_at", label: "Time" },
];

interface LogsTableProps {
	rows: TokenActivityLogRow[];
	loading: boolean;
	orderBy: TokenActivityLogOrderBy;
	orderDir: "asc" | "desc";
	onSort: (column: TokenActivityLogOrderBy) => void;
}

function SortIcon({
	column,
	orderBy,
	orderDir,
}: {
	column: TokenActivityLogOrderBy;
	orderBy: TokenActivityLogOrderBy;
	orderDir: "asc" | "desc";
}) {
	if (orderBy !== column) {
		return <ArrowUpDown className="ml-1 inline h-3.5 w-3.5 opacity-50" />;
	}
	return orderDir === "asc" ? (
		<ArrowUp className="ml-1 inline h-3.5 w-3.5" />
	) : (
		<ArrowDown className="ml-1 inline h-3.5 w-3.5" />
	);
}

export function LogsTable({ rows, loading, orderBy, orderDir, onSort }: LogsTableProps) {
	return (
		<div className="min-h-0 flex-1 overflow-auto rounded-card border border-border">
			<table className="w-full min-w-[800px] text-left text-sm">
				<thead>
					<tr className="border-b border-border bg-surface-sunken">
						{COLUMNS.map((col) => (
							<th key={col.column} className="px-4 py-3 font-medium">
								<button
									type="button"
									onClick={() => onSort(col.column)}
									className="flex items-center hover:underline"
								>
									{col.label}
									<SortIcon column={col.column} orderBy={orderBy} orderDir={orderDir} />
								</button>
							</th>
						))}
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
							<td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
								No logs match the filters.
							</td>
						</tr>
					) : (
						rows.map((row) => (
							<tr key={row.id} className="border-b border-border">
								<td className="px-4 py-2 uppercase">{row.request_type}</td>
								<td className="px-4 py-2 font-mono text-xs">{row.ip_address ?? "—"}</td>
								<td className="px-4 py-2">{row.environment_name ?? "—"}</td>
								<td className="px-4 py-2">
									{row.succeeded ? (
										<span className="text-success-icon">Yes</span>
									) : (
										<span className="text-danger-icon">No</span>
									)}
								</td>
								<td className="px-4 py-2 font-mono text-xs">{formatMs(row.duration_ms)}</td>
								<td className="px-4 py-2 font-mono text-xs">{formatDate(row.created_at)}</td>
							</tr>
						))
					)}
				</tbody>
			</table>
		</div>
	);
}
