import type { AdminAuditLogListEntry } from "@/lib/repositories/admin-audit-log.repository";
import { DetailsCell } from "./details-cell";

function formatDate(iso: string): string {
	return new Date(iso).toLocaleString();
}

export function AuditLogRow({ row }: { row: AdminAuditLogListEntry }) {
	return (
		<tr className="border-b border-border align-top">
			<td className="px-4 py-2 font-mono text-xs">{formatDate(row.created_at)}</td>
			<td className="px-4 py-2">
				{row.actor_username ? (
					<span>{row.actor_username}</span>
				) : row.actor_user_id ? (
					<span className="font-mono text-xs text-muted-foreground">{row.actor_user_id}</span>
				) : (
					<span className="text-muted-foreground">—</span>
				)}
			</td>
			<td className="px-4 py-2 font-mono text-xs">{row.action}</td>
			<td className="px-4 py-2">
				<div className="flex flex-col">
					<span>{row.resource_type}</span>
					{row.resource_id && (
						<span className="font-mono text-xs text-muted-foreground">{row.resource_id}</span>
					)}
				</div>
			</td>
			<td className="px-4 py-2">
				<DetailsCell raw={row.details} />
			</td>
		</tr>
	);
}
