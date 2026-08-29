"use client";

import { ReducerAction, bootstrapProvider } from "@eetr/react-reducer-utils";
import { useEffect, useRef } from "react";
import { Layers, Pencil, Plus, Settings, Tag } from "lucide-react";
import { Button, ConfirmDialog, FullPageSpinner, PageHeader, SidePanel } from "@/components/ui";
import {
	listEnvironments,
	createEnvironment,
	updateEnvironment,
	deleteEnvironment,
} from "@/app/actions/environment-actions";
import {
	listScopes,
	createScope,
	updateScope,
	deleteScope,
} from "@/app/actions/scope-actions";
import {
	listPasswordPolicies,
	createPasswordPolicy,
	updatePasswordPolicy,
	deletePasswordPolicy,
} from "@/app/actions/password-policy-actions";
import type { CreatePasswordPolicyInput } from "@/lib/repositories/password-policy.repository";
import { listClients } from "@/app/actions/client-actions";
import {
	getSiteSettings,
	updateSiteSettings,
	getAdminApiClientRowIds,
	setAdminApiClientRowIds,
	clearSiteLogo,
} from "@/app/actions/site-settings-actions";
import type { SiteSettingsDto } from "@/lib/services/site-settings.service";
import type { Environment } from "@/lib/repositories/environment.repository";
import type { Scope } from "@/lib/repositories/scope.repository";
import {
	type ClientListItem,
	type SetupPageState,
	SetupPageActionType,
	initialState,
	reducer,
} from "./_components/state";
import { SetupTabs } from "./_components/setup-tabs";
import { SiteIdentitySection } from "./_components/site-identity-section";
import { AdminApiSection } from "./_components/admin-api-section";
import { BasicSection } from "./_components/basic-section";
import { EnvironmentsSection } from "./_components/environments-section";
import { EnvironmentForm } from "./_components/environment-form";
import { ScopeForm } from "./_components/scope-form";
import {
	draftFromEnvironment,
	emptyEnvironmentDraft,
	isEnvironmentDraftDirty,
} from "./_components/environment-draft";
import { draftFromScope, emptyScopeDraft, isScopeDraftDirty } from "./_components/scope-draft";
import { ScopesSection } from "./_components/scopes-section";
import { PasswordPoliciesSection } from "./_components/password-policies-section";
import { environmentLabel } from "@/lib/repositories/environment.repository";

/** Each form lives in its panel body; its submit button lives in the panel footer. */
const ENV_FORM_ID = "environment-form";
const SCOPE_FORM_ID = "scope-form";

const { Provider: SetupPageStateProvider, useContextAccessors: useSetupPageState } =
	bootstrapProvider<SetupPageState, ReducerAction<SetupPageActionType>>(
		reducer,
		initialState
	);

export default function SetupPage() {
	return (
		<SetupPageStateProvider>
			<SetupPageContent />
		</SetupPageStateProvider>
	);
}

function SetupPageContent() {
	const { state, dispatch } = useSetupPageState();
	const {
		activeTab,
		environments,
		scopes,
		passwordPolicies,
		passwordPolicyError,
		loading,
		envPanelOpen,
		envEditingId,
		envDraft,
		envBaseline,
		envConfirmingDiscard,
		scopePanelOpen,
		scopeEditingId,
		scopeDraft,
		scopeBaseline,
		scopeConfirmingDiscard,
		envError,
		envSaving,
		scopeError,
		scopeSaving,
		siteSettings,
		siteTitleInput,
		siteUrlInput,
		cdnUrlInput,
		mfaEnabledInput,
		clients,
		selectedAdminClientIds,
		siteError,
		adminClientsError,
		siteSaving,
		logoUploading,
		logoStagedKey,
		logoPreviewUrl,
		adminClientsSaving,
	} = state;

	const logoInputRef = useRef<HTMLInputElement>(null);

	const envById = new Map(environments.map((e) => [e.id, environmentLabel(e)]));

	/**
	 * `silent` skips the full-page spinner. Post-mutation refreshes must be
	 * silent: swapping the whole page for a spinner would unmount any open side
	 * panel mid-animation, and the control that triggered the mutation already
	 * shows its own in-flight state.
	 */
	const load = async ({ silent = false }: { silent?: boolean } = {}) => {
		if (!silent) dispatch({ type: SetupPageActionType.SET_LOADING, data: true });
		try {
			const [envs, scopesList, policiesList, settings, clientsRaw, adminIds] = await Promise.all([
				listEnvironments(),
				listScopes(),
				listPasswordPolicies(),
				getSiteSettings(),
				listClients(),
				getAdminApiClientRowIds(),
			]);
			dispatch({ type: SetupPageActionType.SET_ENVIRONMENTS, data: envs });
			dispatch({ type: SetupPageActionType.SET_SCOPES, data: scopesList });
			dispatch({ type: SetupPageActionType.SET_PASSWORD_POLICIES, data: policiesList });
			dispatch({ type: SetupPageActionType.SET_SITE_SETTINGS, data: settings });
			const clientItems: ClientListItem[] = clientsRaw.map((c) => ({
				id: c.id,
				clientId: c.clientId,
				name: c.name,
				environmentId: c.environmentId,
			}));
			clientItems.sort((a, b) => {
				const an = (a.name ?? a.clientId).toLowerCase();
				const bn = (b.name ?? b.clientId).toLowerCase();
				return an.localeCompare(bn);
			});
			dispatch({ type: SetupPageActionType.SET_CLIENTS, data: clientItems });
			dispatch({ type: SetupPageActionType.SET_SELECTED_ADMIN_CLIENT_IDS, data: adminIds });
		} finally {
			if (!silent) dispatch({ type: SetupPageActionType.SET_LOADING, data: false });
		}
	};

	useEffect(() => {
		load();
	}, [dispatch]);

	// The save, clear and replace paths each revoke the previous preview, but
	// leaving the page with one staged unmounts without passing through them.
	const logoPreviewUrlRef = useRef<string | null>(null);
	logoPreviewUrlRef.current = logoPreviewUrl;
	useEffect(
		() => () => {
			if (logoPreviewUrlRef.current) URL.revokeObjectURL(logoPreviewUrlRef.current);
		},
		[],
	);

	const envDirty = isEnvironmentDraftDirty(envDraft, envBaseline);
	const scopeDirty = isScopeDraftDirty(scopeDraft, scopeBaseline);

	const openEnvCreate = () => {
		dispatch({ type: SetupPageActionType.SET_ENV_ERROR, data: null });
		dispatch({
			type: SetupPageActionType.SET_ENV_PANEL,
			data: { open: true, editingId: null, draft: emptyEnvironmentDraft },
		});
	};

	const openEnvEdit = (env: Environment) => {
		dispatch({ type: SetupPageActionType.SET_ENV_ERROR, data: null });
		dispatch({
			type: SetupPageActionType.SET_ENV_PANEL,
			data: { open: true, editingId: env.id, draft: draftFromEnvironment(env) },
		});
	};

	// Deliberately does not reset the draft: the panel keeps rendering its children
	// while it animates out. Every open path re-initialises draft and baseline.
	const closeEnvPanel = () => {
		dispatch({ type: SetupPageActionType.SET_ENV_PANEL, data: { open: false } });
		dispatch({ type: SetupPageActionType.SET_ENV_ERROR, data: null });
	};

	const requestCloseEnvPanel = () => {
		// The panel stays mounted for its exit animation, so without this a second
		// Escape would re-open the discard dialog over an already-closing panel.
		if (!envPanelOpen || envSaving) return;
		if (envDirty) {
			dispatch({ type: SetupPageActionType.SET_ENV_CONFIRMING_DISCARD, data: true });
		} else {
			closeEnvPanel();
		}
	};

	const handleSubmitEnv = async (e: React.FormEvent) => {
		e.preventDefault();
		dispatch({ type: SetupPageActionType.SET_ENV_ERROR, data: null });
		const name = envDraft.name.trim();
		if (!name) {
			dispatch({ type: SetupPageActionType.SET_ENV_ERROR, data: "Environment name is required" });
			return;
		}
		dispatch({ type: SetupPageActionType.SET_ENV_SAVING, data: true });
		try {
			if (envEditingId) {
				// The action resolves to the updated Environment, or null when the id no
				// longer exists — say so rather than leaving the panel silently open.
				const result = await updateEnvironment(envEditingId, name, envDraft.displayName);
				if (!result) {
					dispatch({
						type: SetupPageActionType.SET_ENV_ERROR,
						data: "Environment no longer exists",
					});
					return;
				}
			} else {
				await createEnvironment(name, envDraft.displayName);
			}
			await load({ silent: true });
			closeEnvPanel();
		} catch (err) {
			dispatch({
				type: SetupPageActionType.SET_ENV_ERROR,
				data:
					err instanceof Error
						? err.message
						: `Failed to ${envEditingId ? "update" : "create"} environment`,
			});
		} finally {
			dispatch({ type: SetupPageActionType.SET_ENV_SAVING, data: false });
		}
	};

	const handleDeleteEnv = async (id: string) => {
		dispatch({ type: SetupPageActionType.SET_ENV_ERROR, data: null });
		dispatch({ type: SetupPageActionType.SET_ENV_SAVING, data: true });
		try {
			const result = await deleteEnvironment(id);
			if (result.ok) {
				await load({ silent: true });
			} else {
				dispatch({
					type: SetupPageActionType.SET_ENV_ERROR,
					data: result.error ?? "Failed to delete",
				});
			}
		} catch (err) {
			dispatch({
				type: SetupPageActionType.SET_ENV_ERROR,
				data: err instanceof Error ? err.message : "Failed to delete environment",
			});
		} finally {
			dispatch({ type: SetupPageActionType.SET_ENV_SAVING, data: false });
		}
	};

	const openScopeCreate = () => {
		dispatch({ type: SetupPageActionType.SET_SCOPE_ERROR, data: null });
		dispatch({
			type: SetupPageActionType.SET_SCOPE_PANEL,
			data: { open: true, editingId: null, draft: emptyScopeDraft },
		});
	};

	const openScopeEdit = (scope: Scope) => {
		dispatch({ type: SetupPageActionType.SET_SCOPE_ERROR, data: null });
		dispatch({
			type: SetupPageActionType.SET_SCOPE_PANEL,
			data: { open: true, editingId: scope.id, draft: draftFromScope(scope) },
		});
	};

	const closeScopePanel = () => {
		dispatch({ type: SetupPageActionType.SET_SCOPE_PANEL, data: { open: false } });
		dispatch({ type: SetupPageActionType.SET_SCOPE_ERROR, data: null });
	};

	const requestCloseScopePanel = () => {
		if (!scopePanelOpen || scopeSaving) return;
		if (scopeDirty) {
			dispatch({ type: SetupPageActionType.SET_SCOPE_CONFIRMING_DISCARD, data: true });
		} else {
			closeScopePanel();
		}
	};

	const handleSubmitScope = async (e: React.FormEvent) => {
		e.preventDefault();
		dispatch({ type: SetupPageActionType.SET_SCOPE_ERROR, data: null });
		const name = scopeDraft.scopeName.trim();
		if (!name) {
			dispatch({ type: SetupPageActionType.SET_SCOPE_ERROR, data: "Scope name is required" });
			return;
		}
		dispatch({ type: SetupPageActionType.SET_SCOPE_SAVING, data: true });
		try {
			if (scopeEditingId) {
				// Only the consent copy is editable; scopeName is the protocol token.
				const result = await updateScope(
					scopeEditingId,
					scopeDraft.displayName,
					scopeDraft.description
				);
				if (!result) {
					dispatch({ type: SetupPageActionType.SET_SCOPE_ERROR, data: "Scope no longer exists" });
					return;
				}
			} else {
				await createScope(name, scopeDraft.displayName, scopeDraft.description);
			}
			await load({ silent: true });
			closeScopePanel();
		} catch (err) {
			dispatch({
				type: SetupPageActionType.SET_SCOPE_ERROR,
				data:
					err instanceof Error
						? err.message
						: `Failed to ${scopeEditingId ? "update" : "create"} scope`,
			});
		} finally {
			dispatch({ type: SetupPageActionType.SET_SCOPE_SAVING, data: false });
		}
	};

	const handleDeleteScope = async (id: string) => {
		dispatch({ type: SetupPageActionType.SET_SCOPE_ERROR, data: null });
		dispatch({ type: SetupPageActionType.SET_SCOPE_SAVING, data: true });
		try {
			const result = await deleteScope(id);
			if (result.ok) {
				await load({ silent: true });
			} else {
				dispatch({
					type: SetupPageActionType.SET_SCOPE_ERROR,
					data: result.error ?? "Failed to delete",
				});
			}
		} catch (err) {
			dispatch({
				type: SetupPageActionType.SET_SCOPE_ERROR,
				data: err instanceof Error ? err.message : "Failed to delete scope",
			});
		} finally {
			dispatch({ type: SetupPageActionType.SET_SCOPE_SAVING, data: false });
		}
	};

	const handleCreatePolicy = async (
		input: CreatePasswordPolicyInput,
		environmentIds: string[]
	): Promise<boolean> => {
		dispatch({ type: SetupPageActionType.SET_PASSWORD_POLICY_ERROR, data: null });
		try {
			const result = await createPasswordPolicy(input, environmentIds);
			if (!result.ok) {
				dispatch({
					type: SetupPageActionType.SET_PASSWORD_POLICY_ERROR,
					data: result.error ?? "Failed to create policy",
				});
				return false;
			}
			await load({ silent: true });
			return true;
		} catch (err) {
			dispatch({
				type: SetupPageActionType.SET_PASSWORD_POLICY_ERROR,
				data: err instanceof Error ? err.message : "Failed to create policy",
			});
			return false;
		}
	};

	const handleUpdatePolicy = async (
		id: string,
		input: CreatePasswordPolicyInput,
		environmentIds: string[]
	): Promise<boolean> => {
		dispatch({ type: SetupPageActionType.SET_PASSWORD_POLICY_ERROR, data: null });
		try {
			const result = await updatePasswordPolicy(id, input, environmentIds);
			if (!result.ok) {
				dispatch({
					type: SetupPageActionType.SET_PASSWORD_POLICY_ERROR,
					data: result.error ?? "Failed to update policy",
				});
				return false;
			}
			await load({ silent: true });
			return true;
		} catch (err) {
			dispatch({
				type: SetupPageActionType.SET_PASSWORD_POLICY_ERROR,
				data: err instanceof Error ? err.message : "Failed to update policy",
			});
			return false;
		}
	};

	const handleDeletePolicy = async (id: string): Promise<boolean> => {
		dispatch({ type: SetupPageActionType.SET_PASSWORD_POLICY_ERROR, data: null });
		try {
			const result = await deletePasswordPolicy(id);
			if (!result.ok) {
				dispatch({
					type: SetupPageActionType.SET_PASSWORD_POLICY_ERROR,
					data: result.error ?? "Failed to delete policy",
				});
				return false;
			}
			await load({ silent: true });
			return true;
		} catch (err) {
			dispatch({
				type: SetupPageActionType.SET_PASSWORD_POLICY_ERROR,
				data: err instanceof Error ? err.message : "Failed to delete policy",
			});
			return false;
		}
	};

	const handleSetAdminPolicy = async (policyId: string | null): Promise<boolean> => {
		dispatch({ type: SetupPageActionType.SET_PASSWORD_POLICY_ERROR, data: null });
		try {
			const dto = await updateSiteSettings({ adminPasswordPolicyId: policyId });
			dispatch({ type: SetupPageActionType.SET_SITE_SETTINGS, data: dto });
			return true;
		} catch (err) {
			dispatch({
				type: SetupPageActionType.SET_PASSWORD_POLICY_ERROR,
				data: err instanceof Error ? err.message : "Failed to set admin password policy",
			});
			return false;
		}
	};

	const handleSaveSite = async (e: React.FormEvent) => {
		e.preventDefault();
		// A staged logo is not on the wire yet, so saving mid-upload would persist
		// the rest of the form and silently drop the picture.
		if (logoUploading) return;
		dispatch({ type: SetupPageActionType.SET_SITE_ERROR, data: null });
		dispatch({ type: SetupPageActionType.SET_SITE_SAVING, data: true });
		try {
			const dto = await updateSiteSettings({
				siteTitle: siteTitleInput.trim() || null,
				siteUrl: siteUrlInput.trim() || null,
				cdnUrl: cdnUrlInput.trim() || null,
				mfaEnabled: mfaEnabledInput,
				...(logoStagedKey ? { logoStagedKey } : {}),
			});
			dispatch({ type: SetupPageActionType.SET_SITE_SETTINGS, data: dto });
			if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
			dispatch({
				type: SetupPageActionType.SET_STAGED_LOGO,
				data: { key: null, previewUrl: null },
			});
		} catch (err) {
			dispatch({
				type: SetupPageActionType.SET_SITE_ERROR,
				data: err instanceof Error ? err.message : "Failed to save site settings",
			});
		} finally {
			dispatch({ type: SetupPageActionType.SET_SITE_SAVING, data: false });
		}
	};

	/**
	 * Uploads to staging and records the key. The live logo is only replaced when
	 * the Site identity form is saved.
	 */
	const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file) return;
		dispatch({ type: SetupPageActionType.SET_SITE_ERROR, data: null });
		dispatch({ type: SetupPageActionType.SET_LOGO_UPLOADING, data: true });
		try {
			const body = new FormData();
			body.set("file", file);
			const res = await fetch("/api/admin/site-logo", { method: "POST", body });
			const json = (await res.json().catch(() => null)) as
				| { stagedKey?: string; error_description?: string; error?: string }
				| null;
			if (!res.ok || !json?.stagedKey) {
				throw new Error(json?.error_description ?? json?.error ?? "Upload failed");
			}
			if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
			dispatch({
				type: SetupPageActionType.SET_STAGED_LOGO,
				data: { key: json.stagedKey, previewUrl: URL.createObjectURL(file) },
			});
		} catch (err) {
			dispatch({
				type: SetupPageActionType.SET_SITE_ERROR,
				data: err instanceof Error ? err.message : "Failed to upload logo",
			});
		} finally {
			dispatch({ type: SetupPageActionType.SET_LOGO_UPLOADING, data: false });
		}
	};

	const handleClearLogo = async () => {
		dispatch({ type: SetupPageActionType.SET_SITE_ERROR, data: null });
		dispatch({ type: SetupPageActionType.SET_LOGO_UPLOADING, data: true });
		try {
			const dto = await clearSiteLogo();
			dispatch({ type: SetupPageActionType.SET_SITE_SETTINGS, data: dto });
			// Drop any staged logo too, or the next save would promote it and undo
			// the clear the admin just asked for.
			if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
			dispatch({
				type: SetupPageActionType.SET_STAGED_LOGO,
				data: { key: null, previewUrl: null },
			});
		} catch (err) {
			dispatch({
				type: SetupPageActionType.SET_SITE_ERROR,
				data: err instanceof Error ? err.message : "Failed to clear logo",
			});
		} finally {
			dispatch({ type: SetupPageActionType.SET_LOGO_UPLOADING, data: false });
		}
	};

	const toggleAdminClient = (id: string) => {
		const set = new Set(selectedAdminClientIds);
		if (set.has(id)) set.delete(id);
		else set.add(id);
		dispatch({
			type: SetupPageActionType.SET_SELECTED_ADMIN_CLIENT_IDS,
			data: [...set],
		});
	};

	const handleSaveAdminClients = async () => {
		dispatch({ type: SetupPageActionType.SET_ADMIN_CLIENTS_ERROR, data: null });
		dispatch({ type: SetupPageActionType.SET_ADMIN_CLIENTS_SAVING, data: true });
		try {
			await setAdminApiClientRowIds(selectedAdminClientIds);
		} catch (err) {
			dispatch({
				type: SetupPageActionType.SET_ADMIN_CLIENTS_ERROR,
				data: err instanceof Error ? err.message : "Failed to save admin API clients",
			});
		} finally {
			dispatch({ type: SetupPageActionType.SET_ADMIN_CLIENTS_SAVING, data: false });
		}
	};

	if (loading) {
		return <FullPageSpinner />;
	}

	return (
		<main className="min-h-screen bg-background p-6 text-foreground">
			<PageHeader icon={Settings} title="Setup" />

			<SetupTabs activeTab={activeTab} dispatch={dispatch} />

			<SiteIdentitySection
				activeTab={activeTab}
				siteSettings={siteSettings}
				siteTitleInput={siteTitleInput}
				siteUrlInput={siteUrlInput}
				cdnUrlInput={cdnUrlInput}
				mfaEnabledInput={mfaEnabledInput}
				siteError={siteError}
				siteSaving={siteSaving}
				logoUploading={logoUploading}
				logoPreviewUrl={logoPreviewUrl}
				logoInputRef={logoInputRef}
				dispatch={dispatch}
				onSubmit={handleSaveSite}
				onLogoChange={handleLogoChange}
				onClearLogo={handleClearLogo}
			/>

			<AdminApiSection
				activeTab={activeTab}
				clients={clients}
				selectedAdminClientIds={selectedAdminClientIds}
				adminClientsError={adminClientsError}
				adminClientsSaving={adminClientsSaving}
				envById={envById}
				onToggleClient={toggleAdminClient}
				onSave={handleSaveAdminClients}
			/>

			<BasicSection
				activeTab={activeTab}
				environments={
					<EnvironmentsSection
						saving={envSaving}
						environments={environments}
						envError={envError}
						onCreate={openEnvCreate}
						onEdit={openEnvEdit}
						onDelete={handleDeleteEnv}
					/>
				}
				scopes={
					<ScopesSection
						saving={scopeSaving}
						scopes={scopes}
						scopeError={scopeError}
						onCreate={openScopeCreate}
						onEdit={openScopeEdit}
						onDelete={handleDeleteScope}
					/>
				}
			/>

			<PasswordPoliciesSection
				activeTab={activeTab}
				policies={passwordPolicies}
				environments={environments}
				error={passwordPolicyError}
				adminPasswordPolicyId={siteSettings?.adminPasswordPolicyId ?? null}
				onClearError={() =>
					dispatch({ type: SetupPageActionType.SET_PASSWORD_POLICY_ERROR, data: null })
				}
				onCreate={handleCreatePolicy}
				onUpdate={handleUpdatePolicy}
				onDelete={handleDeletePolicy}
				onSetAdminPolicy={handleSetAdminPolicy}
			/>
			<SidePanel
				open={envPanelOpen}
				onRequestClose={requestCloseEnvPanel}
				icon={Layers}
				title={envEditingId ? "Edit environment" : "New environment"}
				description={
					envEditingId
						? "The environment name is used by live tokens — change it with care."
						: "Environments group clients and scope password policies to a deployment."
				}
				footer={
					<div className="flex items-center gap-2">
						<Button
							type="submit"
							form={ENV_FORM_ID}
							icon={envEditingId ? Pencil : Plus}
							loading={envSaving}
						>
							{envEditingId ? "Save environment" : "Add environment"}
						</Button>
						<Button
							type="button"
							variant="secondary"
							onClick={requestCloseEnvPanel}
							disabled={envSaving}
						>
							Cancel
						</Button>
					</div>
				}
			>
				<EnvironmentForm
					formId={ENV_FORM_ID}
					draft={envDraft}
					onChange={(patch) =>
						dispatch({
							type: SetupPageActionType.SET_ENV_DRAFT,
							data: { ...envDraft, ...patch },
						})
					}
					error={envError}
					onSubmit={handleSubmitEnv}
				/>
			</SidePanel>

			{/* Sibling of the panel, never inside it: the animated panel is a containing
			    block, so a nested fixed overlay would resolve against it. */}
			<ConfirmDialog
				open={envConfirmingDiscard}
				title="Discard changes?"
				description="This environment has unsaved edits. Closing the panel will lose them."
				confirmLabel="Discard"
				onConfirm={closeEnvPanel}
				onCancel={() =>
					dispatch({ type: SetupPageActionType.SET_ENV_CONFIRMING_DISCARD, data: false })
				}
			/>

			<SidePanel
				open={scopePanelOpen}
				onRequestClose={requestCloseScopePanel}
				icon={Tag}
				title={scopeEditingId ? "Edit scope" : "New scope"}
				description={
					scopeEditingId
						? "Only the consent copy can be changed — clients request the scope name."
						: "Scopes are the permissions a client can request during authorization."
				}
				footer={
					<div className="flex items-center gap-2">
						<Button
							type="submit"
							form={SCOPE_FORM_ID}
							icon={scopeEditingId ? Pencil : Plus}
							loading={scopeSaving}
						>
							{scopeEditingId ? "Save scope" : "Add scope"}
						</Button>
						<Button
							type="button"
							variant="secondary"
							onClick={requestCloseScopePanel}
							disabled={scopeSaving}
						>
							Cancel
						</Button>
					</div>
				}
			>
				<ScopeForm
					formId={SCOPE_FORM_ID}
					draft={scopeDraft}
					onChange={(patch) =>
						dispatch({
							type: SetupPageActionType.SET_SCOPE_DRAFT,
							data: { ...scopeDraft, ...patch },
						})
					}
					editingId={scopeEditingId}
					error={scopeError}
					onSubmit={handleSubmitScope}
				/>
			</SidePanel>

			<ConfirmDialog
				open={scopeConfirmingDiscard}
				title="Discard changes?"
				description="This scope has unsaved edits. Closing the panel will lose them."
				confirmLabel="Discard"
				onConfirm={closeScopePanel}
				onCancel={() =>
					dispatch({ type: SetupPageActionType.SET_SCOPE_CONFIRMING_DISCARD, data: false })
				}
			/>
		</main>
	);
}
