import { Spinner } from "@/components/ui";
import type { AdminAuditLogListEntry } from "@/lib/repositories/admin-audit-log.repository";
import { AuditLogRow } from "./audit-log-row";

interface AuditLogTableProps {
	rows: AdminAuditLogListEntry[];
	loading: boolean;
}

export function AuditLogTable({ rows, loading }: AuditLogTableProps) {
	return (
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
								<Spinner className="mx-auto h-6 w-6 text-muted-foreground" />
							</td>
						</tr>
					) : rows.length === 0 ? (
						<tr>
							<td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
								No audit entries match the filters.
							</td>
						</tr>
					) : (
						rows.map((row) => <AuditLogRow key={row.id} row={row} />)
					)}
				</tbody>
			</table>
		</div>
	);
}
