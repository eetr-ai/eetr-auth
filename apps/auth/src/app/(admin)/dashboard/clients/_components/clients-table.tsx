import Link from "next/link";
import { Eye } from "lucide-react";
import type { Environment } from "@/lib/repositories/environment.repository";
import type { Client } from "@/lib/repositories/client.repository";
import { DeleteClientButton } from "./delete-client-button";

interface ClientsTableProps {
	clients: Client[];
	environments: Environment[];
	envFilter: string;
	onEnvFilterChange: (v: string) => void;
	onClientDeleted: () => void;
}

export function ClientsTable({
	clients,
	environments,
	envFilter,
	onEnvFilterChange,
	onClientDeleted,
}: ClientsTableProps) {
	const envById = Object.fromEntries(environments.map((e) => [e.id, e]));

	return (
		<div className="mt-6">
			<div className="mb-2 flex items-center gap-2">
				<label className="text-sm font-medium">Filter by environment</label>
				<select
					value={envFilter}
					onChange={(e) => onEnvFilterChange(e.target.value)}
					className="rounded-xl border border-brand-muted bg-background px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
				>
					<option value="">All</option>
					{environments.map((e) => (
						<option key={e.id} value={e.id}>
							{e.name}
						</option>
					))}
				</select>
			</div>
			<div className="overflow-x-auto rounded-xl border border-brand-muted">
				<table className="w-full min-w-[500px] text-left text-sm">
					<thead>
						<tr className="border-b border-brand-muted bg-brand-muted/20">
							<th className="px-4 py-3 font-medium">Name</th>
							<th className="px-4 py-3 font-medium">Client ID</th>
							<th className="px-4 py-3 font-medium">Environment</th>
							<th className="px-4 py-3 font-medium">Created by</th>
							<th className="px-4 py-3 font-medium">Actions</th>
						</tr>
					</thead>
					<tbody>
						{clients.map((c) => (
							<tr key={c.id} className="border-b border-brand-muted/50">
								<td className="px-4 py-3">{c.name ?? "—"}</td>
								<td className="px-4 py-3 font-mono text-xs">{c.clientId}</td>
								<td className="px-4 py-3">
									{envById[c.environmentId]?.name ?? c.environmentId}
								</td>
								<td className="px-4 py-3 text-muted-foreground">{c.createdBy}</td>
								<td className="px-4 py-3">
									<div className="flex gap-2">
										<Link
											href={`/dashboard/clients/${c.id}`}
											className="flex items-center gap-1 rounded-full border border-brand-muted px-2 py-1 text-xs hover:bg-brand-muted/30"
										>
											<Eye className="h-3 w-3" />
											View
										</Link>
										<DeleteClientButton
											clientId={c.id}
											clientDisplayId={c.name ?? c.clientId}
											onDeleted={onClientDeleted}
										/>
									</div>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{clients.length === 0 && (
				<p className="mt-4 text-center text-sm text-muted-foreground">
					No clients yet. Create one above or add environments and scopes in Setup first.
				</p>
			)}
		</div>
	);
}
