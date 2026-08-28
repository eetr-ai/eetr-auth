"use client";

import { ReducerAction, bootstrapProvider } from "@eetr/react-reducer-utils";
import { useEffect, useRef } from "react";
import { Settings } from "lucide-react";
import { FullPageSpinner, PageHeader } from "@/components/ui";
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
import { ScopesSection } from "./_components/scopes-section";
import { PasswordPoliciesSection } from "./_components/password-policies-section";

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
		envName,
		scopeName,
		scopeDisplayName,
		scopeDescription,
		editingEnvId,
		editingEnvName,
		editingScopeId,
		editingScopeDisplayName,
		editingScopeDescription,
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

	const envById = new Map(environments.map((e) => [e.id, e.name]));

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

	const handleCreateEnv = async (e: React.FormEvent) => {
		e.preventDefault();
		dispatch({ type: SetupPageActionType.SET_ENV_ERROR, data: null });
		const name = envName.trim();
		if (!name) return;
		dispatch({ type: SetupPageActionType.SET_ENV_SAVING, data: true });
		try {
			await createEnvironment(name);
			dispatch({ type: SetupPageActionType.SET_ENV_NAME, data: "" });
			await load({ silent: true });
		} catch (err) {
			dispatch({
				type: SetupPageActionType.SET_ENV_ERROR,
				data: err instanceof Error ? err.message : "Failed to create environment",
			});
		} finally {
			dispatch({ type: SetupPageActionType.SET_ENV_SAVING, data: false });
		}
	};

	const handleUpdateEnv = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!editingEnvId) return;
		dispatch({ type: SetupPageActionType.SET_ENV_ERROR, data: null });
		dispatch({ type: SetupPageActionType.SET_ENV_SAVING, data: true });
		try {
			// The action resolves to the updated Environment, or null when the id no
			// longer exists — say so rather than leaving the row silently in edit mode.
			const result = await updateEnvironment(editingEnvId, editingEnvName.trim());
			if (result) {
				dispatch({ type: SetupPageActionType.SET_EDITING_ENV_ID, data: null });
				dispatch({ type: SetupPageActionType.SET_EDITING_ENV_NAME, data: "" });
				await load({ silent: true });
			} else {
				dispatch({
					type: SetupPageActionType.SET_ENV_ERROR,
					data: "Environment no longer exists",
				});
			}
		} catch (err) {
			dispatch({
				type: SetupPageActionType.SET_ENV_ERROR,
				data: err instanceof Error ? err.message : "Failed to update environment",
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

	const handleCreateScope = async (e: React.FormEvent) => {
		e.preventDefault();
		dispatch({ type: SetupPageActionType.SET_SCOPE_ERROR, data: null });
		const name = scopeName.trim();
		if (!name) return;
		dispatch({ type: SetupPageActionType.SET_SCOPE_SAVING, data: true });
		try {
			await createScope(name, scopeDisplayName, scopeDescription);
			dispatch({ type: SetupPageActionType.SET_SCOPE_NAME, data: "" });
			dispatch({ type: SetupPageActionType.SET_SCOPE_DISPLAY_NAME, data: "" });
			dispatch({ type: SetupPageActionType.SET_SCOPE_DESCRIPTION, data: "" });
			await load({ silent: true });
		} catch (err) {
			dispatch({
				type: SetupPageActionType.SET_SCOPE_ERROR,
				data: err instanceof Error ? err.message : "Failed to create scope",
			});
		} finally {
			dispatch({ type: SetupPageActionType.SET_SCOPE_SAVING, data: false });
		}
	};

	const handleUpdateScope = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!editingScopeId) return;
		dispatch({ type: SetupPageActionType.SET_SCOPE_ERROR, data: null });
		dispatch({ type: SetupPageActionType.SET_SCOPE_SAVING, data: true });
		try {
			const updated = await updateScope(
				editingScopeId,
				editingScopeDisplayName,
				editingScopeDescription
			);
			if (updated) {
				dispatch({ type: SetupPageActionType.SET_EDITING_SCOPE_ID, data: null });
				await load({ silent: true });
			} else {
				dispatch({
					type: SetupPageActionType.SET_SCOPE_ERROR,
					data: "Scope no longer exists",
				});
			}
		} catch (err) {
			dispatch({
				type: SetupPageActionType.SET_SCOPE_ERROR,
				data: err instanceof Error ? err.message : "Failed to update scope",
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
						envName={envName}
						editingEnvId={editingEnvId}
						editingEnvName={editingEnvName}
						envError={envError}
						dispatch={dispatch}
						onCreate={handleCreateEnv}
						onUpdate={handleUpdateEnv}
						onDelete={handleDeleteEnv}
					/>
				}
				scopes={
					<ScopesSection
						saving={scopeSaving}
						scopes={scopes}
						scopeName={scopeName}
						scopeDisplayName={scopeDisplayName}
						scopeDescription={scopeDescription}
						editingScopeId={editingScopeId}
						editingScopeDisplayName={editingScopeDisplayName}
						editingScopeDescription={editingScopeDescription}
						scopeError={scopeError}
						dispatch={dispatch}
						onCreate={handleCreateScope}
						onUpdate={handleUpdateScope}
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
		</main>
	);
}
