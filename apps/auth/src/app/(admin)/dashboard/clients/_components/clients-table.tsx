import { Pencil, Sparkles, Trash2 } from "lucide-react";
import { IconButton, InlineDeleteConfirm, TBody, THead, Table, Td, Th } from "@/components/ui";
import type { Client } from "@/lib/repositories/client.repository";
import type { Environment } from "@/lib/repositories/environment.repository";

export type ClientTypeFilter = "" | "dynamic" | "manual";

interface ClientsTableProps {
	clients: Client[];
	environments: Environment[];
	onStartEdit: (client: Client) => void;
	confirmingDeleteId: string | null;
	deletingId: string | null;
	onRequestDelete: (client: Client) => void;
	onConfirmDelete: (client: Client) => void;
	onCancelDelete: () => void;
}

export function ClientsTable({
	clients,
	environments,
	onStartEdit,
	confirmingDeleteId,
	deletingId,
	onRequestDelete,
	onConfirmDelete,
	onCancelDelete,
}: ClientsTableProps) {
	const envById = new Map(environments.map((env) => [env.id, env.name]));

	return (
		<Table minWidth="min-w-[840px]">
			<THead>
				<Th>Name</Th>
				<Th>Client ID</Th>
				<Th>Type</Th>
				<Th>Environment</Th>
				<Th>Created by</Th>
				<Th className="text-right">Actions</Th>
			</THead>
			<TBody>
				{clients.map((client) => {
					const label = client.name ?? client.clientId;
					return (
						<tr key={client.id}>
							<Td>
								<div className="flex items-center gap-2">
									<span className="truncate">{client.name ?? "—"}</span>
									{client.isDynamic ? (
										<span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-bg px-2 py-0.5 text-xs font-medium text-accent-fg">
											<Sparkles className="h-3 w-3" />
											Dynamic
										</span>
									) : null}
								</div>
							</Td>
							<Td className="font-mono text-xs">{client.clientId}</Td>
							<Td className="text-muted-foreground">
								{client.tokenEndpointAuthMethod === "none" ? "Public (PKCE)" : "Confidential"}
							</Td>
							<Td>{envById.get(client.environmentId) ?? client.environmentId}</Td>
							<Td className="text-muted-foreground">{client.createdBy}</Td>
							<Td>
								<div className="flex items-center justify-end gap-1">
									{confirmingDeleteId === client.id ? (
										<InlineDeleteConfirm
											label={`Delete ${label}?`}
											busy={deletingId === client.id}
											onConfirm={() => onConfirmDelete(client)}
											onCancel={onCancelDelete}
										/>
									) : (
										<>
											<IconButton
												type="button"
												aria-label={`Edit ${label}`}
												title="Edit"
												onClick={() => onStartEdit(client)}
											>
												<Pencil className="h-4 w-4" />
											</IconButton>
											<IconButton
												type="button"
												variant="danger"
												aria-label={`Delete ${label}`}
												title="Delete"
												onClick={() => onRequestDelete(client)}
											>
												<Trash2 className="h-4 w-4" />
											</IconButton>
										</>
									)}
								</div>
							</Td>
						</tr>
					);
				})}
			</TBody>
		</Table>
	);
}
