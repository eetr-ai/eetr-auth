import Link from "next/link";
import { Eye, Sparkles } from "lucide-react";
import type { Environment } from "@/lib/repositories/environment.repository";
import type { Client } from "@/lib/repositories/client.repository";
import { DeleteClientButton } from "./delete-client-button";

export type ClientTypeFilter = "" | "dynamic" | "manual";

interface ClientsTableProps {
	clients: Client[];
	environments: Environment[];
	envFilter: string;
	onEnvFilterChange: (v: string) => void;
	typeFilter: ClientTypeFilter;
	onTypeFilterChange: (v: ClientTypeFilter) => void;
	onClientDeleted: () => void;
}

export function ClientsTable({
	clients,
	environments,
	envFilter,
	onEnvFilterChange,
	typeFilter,
	onTypeFilterChange,
	onClientDeleted,
}: ClientsTableProps) {
	const envById = Object.fromEntries(environments.map((e) => [e.id, e]));
	const visibleClients = clients.filter((c) =>
		typeFilter === "dynamic" ? c.isDynamic : typeFilter === "manual" ? !c.isDynamic : true
	);

	return (
		<div className="mt-6">
			<div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2">
				<div className="flex items-center gap-2">
					<label className="text-sm font-medium">Filter by environment</label>
					<select
						value={envFilter}
						onChange={(e) => onEnvFilterChange(e.target.value)}
						className="rounded-card border border-border bg-background px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
					>
						<option value="">All</option>
						{environments.map((e) => (
							<option key={e.id} value={e.id}>
								{e.name}
							</option>
						))}
					</select>
				</div>
				<div className="flex items-center gap-2">
					<label className="text-sm font-medium">Registration</label>
					<select
						value={typeFilter}
						onChange={(e) => onTypeFilterChange(e.target.value as ClientTypeFilter)}
						className="rounded-card border border-border bg-background px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
					>
						<option value="">All</option>
						<option value="dynamic">Dynamic (DCR)</option>
						<option value="manual">Manual</option>
					</select>
				</div>
			</div>
			<div className="overflow-x-auto rounded-card border border-border">
				<table className="w-full min-w-[500px] text-left text-sm">
					<thead>
						<tr className="border-b border-border bg-surface-sunken">
							<th className="px-4 py-3 font-medium">Name</th>
							<th className="px-4 py-3 font-medium">Client ID</th>
							<th className="px-4 py-3 font-medium">Type</th>
							<th className="px-4 py-3 font-medium">Environment</th>
							<th className="px-4 py-3 font-medium">Created by</th>
							<th className="px-4 py-3 font-medium">Actions</th>
						</tr>
					</thead>
					<tbody>
						{visibleClients.map((c) => (
							<tr key={c.id} className="border-b border-border">
								<td className="px-4 py-3">
									<div className="flex items-center gap-2">
										<span>{c.name ?? "—"}</span>
										{c.isDynamic && (
											<span className="inline-flex items-center gap-1 rounded-full bg-accent-bg px-2 py-0.5 text-xs font-medium text-accent-fg">
												<Sparkles className="h-3 w-3" />
												Dynamic
											</span>
										)}
									</div>
								</td>
								<td className="px-4 py-3 font-mono text-xs">{c.clientId}</td>
								<td className="px-4 py-3 text-muted-foreground">
									{c.tokenEndpointAuthMethod === "none" ? "Public (PKCE)" : "Confidential"}
								</td>
								<td className="px-4 py-3">
									{envById[c.environmentId]?.name ?? c.environmentId}
								</td>
								<td className="px-4 py-3 text-muted-foreground">{c.createdBy}</td>
								<td className="px-4 py-3">
									<div className="flex gap-2">
										<Link
											href={`/dashboard/clients/${c.id}`}
											className="flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs hover:bg-surface-hover"
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
			{visibleClients.length === 0 && (
				<p className="mt-4 text-center text-sm text-muted-foreground">
					{clients.length === 0
						? "No clients yet. Create one above or add environments and scopes in Setup first."
						: "No clients match the current filters."}
				</p>
			)}
		</div>
	);
}
