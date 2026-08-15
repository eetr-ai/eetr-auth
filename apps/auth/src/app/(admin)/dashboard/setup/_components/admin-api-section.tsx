import { Banner, Button } from "@/components/ui";
import type { ClientListItem, SetupTabId } from "./state";

interface AdminApiSectionProps {
	activeTab: SetupTabId;
	clients: ClientListItem[];
	selectedAdminClientIds: string[];
	adminClientsError: string | null;
	adminClientsSaving: boolean;
	envById: Map<string, string>;
	onToggleClient: (id: string) => void;
	onSave: () => void;
}

export function AdminApiSection({
	activeTab,
	clients,
	selectedAdminClientIds,
	adminClientsError,
	adminClientsSaving,
	envById,
	onToggleClient,
	onSave,
}: AdminApiSectionProps) {
	return (
		<section
			className={`mt-6 rounded-card border border-border p-6 ${activeTab !== "admin-api" ? "hidden" : ""}`}
			role="tabpanel"
			id="setup-panel-admin-api"
			aria-labelledby="setup-tab-admin-api"
			aria-hidden={activeTab !== "admin-api"}
		>
			<h2 className="mb-1 text-lg font-medium">Admin API clients</h2>
			<p className="mb-4 text-sm text-muted-foreground">
				OAuth clients allowed to use the future admin API. Credentials are not shown here.
			</p>
			<Banner variant="error" message={adminClientsError} />
			{clients.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					No OAuth clients yet. Create clients under Clients first.
				</p>
			) : (
				<ul className="mb-4 max-h-64 space-y-2 overflow-y-auto rounded-card border border-border p-3">
					{clients.map((c) => {
						const checked = selectedAdminClientIds.includes(c.id);
						const envLabel = envById.get(c.environmentId) ?? c.environmentId;
						const label = c.name?.trim() ? c.name : c.clientId;
						return (
							<li key={c.id}>
								<label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-sunken">
									<input
										type="checkbox"
										checked={checked}
										onChange={() => onToggleClient(c.id)}
										className="mt-1"
									/>
									<span className="min-w-0 flex-1">
										<span className="font-medium">{label}</span>
										<span className="block truncate text-xs text-muted-foreground">
											{c.clientId} · {envLabel}
										</span>
									</span>
								</label>
							</li>
						);
					})}
				</ul>
			)}
			<Button
				type="button"
				loading={adminClientsSaving}
				disabled={clients.length === 0}
				onClick={onSave}
			>
				{adminClientsSaving ? "Saving…" : "Save admin API clients"}
			</Button>
		</section>
	);
}
