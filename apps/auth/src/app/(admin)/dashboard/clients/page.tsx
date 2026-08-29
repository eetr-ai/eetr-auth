"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, Pencil, Plus, RotateCcw } from "lucide-react";
import {
	Banner,
	Button,
	ConfirmDialog,
	EmptyState,
	FullPageSpinner,
	PageHeader,
	Select,
	SidePanel,
} from "@/components/ui";
import {
	createClient,
	deleteClient,
	getClientWithDetails,
	listClients,
	rotateClientSecret,
	updateClientName,
	updateClientRedirectUris,
	updateClientScopes,
	updateClientClaims,
} from "@/app/actions/client-actions";
import { listEnvironments } from "@/app/actions/environment-actions";
import { listScopes } from "@/app/actions/scope-actions";
import type { Client } from "@/lib/repositories/client.repository";
import type { Environment } from "@/lib/repositories/environment.repository";
import type { Scope } from "@/lib/repositories/scope.repository";
import {
	cleanClaims,
	cleanRedirectUris,
	draftFromClient,
	emptyDraft,
	isClientDraftDirty,
	type ClientDraft,
} from "./_components/client-draft";
import { ClientForm } from "./_components/client-form";
import { ClientsTable, type ClientTypeFilter } from "./_components/clients-table";
import { ClientTokens } from "./_components/client-tokens";
import { ClientApiKeys } from "./_components/client-api-keys";
import { SecretReveal } from "./_components/secret-reveal";
import { environmentLabel } from "@/lib/repositories/environment.repository";

/** The form lives in the panel body; its submit button lives in the panel footer. */
const FORM_ID = "client-form";

export default function ClientsPage() {
	const router = useRouter();
	const searchParams = useSearchParams();

	const [clients, setClients] = useState<Client[]>([]);
	const [environments, setEnvironments] = useState<Environment[]>([]);
	const [scopes, setScopes] = useState<Scope[]>([]);
	const [initialLoading, setInitialLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const [envFilter, setEnvFilter] = useState("");
	const [typeFilter, setTypeFilter] = useState<ClientTypeFilter>("");

	const [panelOpen, setPanelOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [draft, setDraft] = useState<ClientDraft>(emptyDraft);
	const [baseline, setBaseline] = useState<ClientDraft>(emptyDraft);
	const [confirmingDiscard, setConfirmingDiscard] = useState(false);
	const [saving, setSaving] = useState(false);
	const [loadingDetails, setLoadingDetails] = useState(false);
	/** The OAuth client_id of the client being edited. Distinct from `editingId`,
	 *  which is the row id — the tokens list keys off the OAuth id. */
	const [editingOauthClientId, setEditingOauthClientId] = useState<string | null>(null);
	/** Dynamically registered (RFC 7591) clients are managed by their own software,
	 *  so the panel shows them read-only: no edits, and no secret to rotate. */
	const [editingIsDynamic, setEditingIsDynamic] = useState(false);

	/** A one-time secret, from creation or rotation. Must be read before dismissal. */
	const [revealedSecret, setRevealedSecret] = useState<{
		clientId: string;
		clientSecret: string;
		reason: "created" | "rotated";
	} | null>(null);
	const [rotating, setRotating] = useState(false);

	const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
	const [deletingId, setDeletingId] = useState<string | null>(null);

	const dirty = isClientDraftDirty(draft, baseline);

	const load = useCallback(
		async ({ silent = false }: { silent?: boolean } = {}) => {
			try {
				const [clientsList, envs, scopesList] = await Promise.all([
					listClients(envFilter || undefined),
					listEnvironments(),
					listScopes(),
				]);
				setClients(clientsList);
				setEnvironments(envs);
				setScopes(scopesList);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to load clients");
			} finally {
				if (!silent) setInitialLoading(false);
			}
		},
		[envFilter],
	);

	useEffect(() => {
		load();
	}, [load]);

	// Panel state is mirrored in the URL so a client stays linkable now that
	// /dashboard/clients/[id] is gone; that route redirects here.
	const setPanelParam = useCallback(
		(value: string | null) => {
			const params = new URLSearchParams(Array.from(searchParams.entries()));
			params.delete("new");
			params.delete("client");
			if (value === "new") params.set("new", "1");
			else if (value) params.set("client", value);
			const query = params.toString();
			router.replace(query ? `/dashboard/clients?${query}` : "/dashboard/clients", {
				scroll: false,
			});
		},
		[router, searchParams],
	);

	const openCreate = useCallback(() => {
		setError(null);
		// Cleared on open, not on close: clearing during the exit animation would
		// flash the empty form as the panel slides away. Opening is the point at
		// which showing a previous client's secret would be a real leak.
		setRevealedSecret(null);
		setEditingId(null);
		setDraft(emptyDraft);
		setBaseline(emptyDraft);
		setPanelOpen(true);
	}, []);

	const startEdit = useCallback(async (clientId: string) => {
		setError(null);
		setRevealedSecret(null);
		setEditingId(clientId);
		setEditingOauthClientId(null);
		setEditingIsDynamic(false);
		setDraft(emptyDraft);
		setBaseline(emptyDraft);
		setPanelOpen(true);
		setLoadingDetails(true);
		try {
			const details = await getClientWithDetails(clientId);
			if (!details) {
				setError("That client no longer exists");
				return;
			}
			const next = draftFromClient(details);
			setDraft(next);
			setBaseline(next);
			setEditingOauthClientId(details.clientId);
			setEditingIsDynamic(details.isDynamic);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load client");
		} finally {
			setLoadingDetails(false);
		}
	}, []);

	// Open from ?client=/?new= on first paint, so a pasted link lands on the panel.
	const requestedClient = searchParams.get("client");
	const requestedNew = searchParams.get("new");
	useEffect(() => {
		if (panelOpen || initialLoading) return;
		if (requestedNew) openCreate();
		else if (requestedClient) void startEdit(requestedClient);
		// Only re-run when the requested target changes, not on every panel toggle.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [requestedClient, requestedNew, initialLoading]);

	useEffect(() => {
		if (!panelOpen) return;
		setPanelParam(editingId ?? "new");
		// setPanelParam identity changes with searchParams, which this effect edits.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [panelOpen, editingId]);

	// Deliberately does not reset draft/editingId: the panel keeps rendering its
	// children while it animates out. Every open path re-initialises both.
	const closePanel = () => {
		setConfirmingDiscard(false);
		setPanelOpen(false);
		setError(null);
		setPanelParam(null);
	};

	const requestClose = () => {
		// The panel stays mounted for its exit animation, so without this a second
		// Escape would re-open the discard dialog over an already-closing panel.
		if (!panelOpen || saving) return;
		// A freshly revealed secret is shown once and nowhere else.
		if (revealedSecret) return;
		if (dirty) setConfirmingDiscard(true);
		else closePanel();
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setSaving(true);
		setError(null);
		try {
			const uris = cleanRedirectUris(draft.redirectUris);
			const claims = cleanClaims(draft.claims);
			if (editingId) {
				await updateClientName(editingId, draft.name.trim() || null);
				await updateClientRedirectUris(editingId, uris);
				await updateClientScopes(editingId, draft.scopeIds);
				// Last: it is the only step that can reject on validation, and doing it after
				// the others means a rejected claim does not also roll back a valid rename.
				await updateClientClaims(editingId, claims);
				await load({ silent: true });
				closePanel();
			} else {
				if (!draft.environmentId.trim()) {
					setError("Select an environment");
					return;
				}
				const result = await createClient({
					environmentId: draft.environmentId,
					name: draft.name.trim() || undefined,
					isTest: draft.isTest,
					redirectUris: uris,
					scopeIds: draft.scopeIds.length > 0 ? draft.scopeIds : undefined,
					expiresAt: draft.expiresAt.trim() || undefined,
				});
				if (claims.length > 0) {
					await updateClientClaims(result.client.id, claims);
				}
				await load({ silent: true });
				// Keep the panel open: the secret is shown exactly once.
				setBaseline(draft);
				setRevealedSecret({
					clientId: result.client.clientId,
					clientSecret: result.clientSecret,
					reason: "created",
				});
			}
		} catch (err) {
			setError(
				err instanceof Error ? err.message : `Failed to ${editingId ? "update" : "create"} client`,
			);
		} finally {
			setSaving(false);
		}
	};

	const handleRotate = async () => {
		if (!editingId) return;
		setError(null);
		setRotating(true);
		try {
			const result = await rotateClientSecret(editingId);
			if (!result) {
				setError("That client no longer exists");
				return;
			}
			setRevealedSecret({
				clientId: result.client.clientId,
				clientSecret: result.clientSecret,
				reason: "rotated",
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to rotate the secret");
		} finally {
			setRotating(false);
		}
	};

	const confirmDelete = async (client: Client) => {
		setError(null);
		setDeletingId(client.id);
		try {
			await deleteClient(client.id);
			setConfirmingDeleteId(null);
			if (editingId === client.id) closePanel();
			await load({ silent: true });
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to delete client");
		} finally {
			setDeletingId(null);
		}
	};

	if (initialLoading) {
		return <FullPageSpinner />;
	}

	const visibleClients = clients.filter((client) => {
		if (typeFilter === "dynamic") return client.isDynamic;
		// "Manual" means "an admin created it", which a test client also is -- the two
		// facets are independent, so a test client stays visible under Manual.
		if (typeFilter === "manual") return !client.isDynamic;
		if (typeFilter === "test") return client.isTest;
		return true;
	});

	const newClientButton = (
		<Button type="button" icon={Plus} onClick={openCreate}>
			New client
		</Button>
	);

	return (
		<main className="min-h-screen bg-background p-6 text-foreground">
			<PageHeader icon={KeyRound} title="Clients" action={newClientButton} />

			{/* Save errors surface inside the panel; list-level errors here. */}
			<Banner variant="error" message={panelOpen ? null : error} />

			<div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
				<div className="flex items-center gap-2">
					<label className="text-sm font-medium" htmlFor="client-env-filter">
						Filter by environment
					</label>
					<Select
						id="client-env-filter"
						value={envFilter}
						onChange={(e) => setEnvFilter(e.target.value)}
					>
						<option value="">All</option>
						{environments.map((env) => (
							<option key={env.id} value={env.id}>
								{environmentLabel(env)}
							</option>
						))}
					</Select>
				</div>
				<div className="flex items-center gap-2">
					<label className="text-sm font-medium" htmlFor="client-type-filter">
						Registration
					</label>
					<Select
						id="client-type-filter"
						value={typeFilter}
						onChange={(e) => setTypeFilter(e.target.value as ClientTypeFilter)}
					>
						<option value="">All</option>
						<option value="dynamic">Dynamic (DCR)</option>
						<option value="manual">Manual</option>
						<option value="test">Test</option>
					</Select>
				</div>
			</div>

			{clients.length === 0 && !envFilter ? (
				<EmptyState
					icon={KeyRound}
					title="No clients yet"
					description="A client is an application that can request tokens from this tenant."
					action={newClientButton}
				/>
			) : visibleClients.length === 0 ? (
				<p className="rounded-card border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
					No clients match the current filters.
				</p>
			) : (
				<ClientsTable
					clients={visibleClients}
					environments={environments}
					onStartEdit={(client) => void startEdit(client.id)}
					confirmingDeleteId={confirmingDeleteId}
					deletingId={deletingId}
					onRequestDelete={(client) => {
						setError(null);
						setConfirmingDeleteId(client.id);
					}}
					onConfirmDelete={confirmDelete}
					onCancelDelete={() => setConfirmingDeleteId(null)}
				/>
			)}

			<SidePanel
				open={panelOpen}
				onRequestClose={requestClose}
				icon={KeyRound}
				width="lg"
				title={editingIsDynamic ? "Client" : editingId ? "Edit client" : "New client"}
				description={
					editingIsDynamic
						? "Registered dynamically (RFC 7591), so it is managed by the client software itself and cannot be edited here."
						: editingId
							? "The environment is fixed at creation, because changing it would invalidate issued tokens."
							: "The client secret is shown once, immediately after creation."
				}
				footer={
					revealedSecret ? (
						<Button type="button" onClick={closePanel}>
							Done
						</Button>
					) : editingIsDynamic ? (
						// Nothing here is editable, so the only action is to leave.
						<Button type="button" variant="secondary" onClick={requestClose}>
							Close
						</Button>
					) : (
						<div className="flex flex-wrap items-center gap-2">
							<Button
								type="submit"
								form={FORM_ID}
								icon={editingId ? Pencil : Plus}
								loading={saving}
								disabled={loadingDetails}
							>
								{editingId ? "Save client" : "Add client"}
							</Button>
							<Button type="button" variant="secondary" onClick={requestClose} disabled={saving}>
								Cancel
							</Button>
							{editingId ? (
								<Button
									type="button"
									variant="secondary"
									icon={RotateCcw}
									loading={rotating}
									onClick={handleRotate}
									className="ml-auto"
								>
									Rotate secret
								</Button>
							) : null}
						</div>
					)
				}
			>
				{revealedSecret ? (
					<SecretReveal
						clientId={revealedSecret.clientId}
						clientSecret={revealedSecret.clientSecret}
						reason={revealedSecret.reason}
					/>
				) : loadingDetails ? (
					<p className="text-sm text-muted-foreground">Loading client…</p>
				) : (
					<>
						<ClientForm
							formId={FORM_ID}
							draft={draft}
							onChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
							environments={environments}
							scopes={scopes}
							editingId={editingId}
							readOnly={editingIsDynamic}
							error={error}
							onSubmit={handleSubmit}
						/>
						{/* baseline, not draft: the service validates a key's scopes against the
						    SAVED grants, so offering an unsaved tick would fail on create. */}
						<ClientApiKeys
							clientId={editingId}
							scopes={scopes}
							grantedScopeIds={baseline.scopeIds}
						/>
						<ClientTokens
							clientId={editingId}
							oauthClientId={editingOauthClientId}
							environments={environments}
						/>
					</>
				)}
			</SidePanel>

			<ConfirmDialog
				open={confirmingDiscard}
				title="Discard changes?"
				description="This client has unsaved edits. Closing the panel will lose them."
				confirmLabel="Discard changes"
				cancelLabel="Keep editing"
				emphasis="cancel"
				onConfirm={closePanel}
				onCancel={() => setConfirmingDiscard(false)}
			/>
		</main>
	);
}
