"use client";

import { ReducerAction, bootstrapProvider } from "@eetr/react-reducer-utils";
import { useEffect, useRef } from "react";
import { Settings } from "lucide-react";
import { FullPageSpinner } from "@/components/ui";
import {
	listEnvironments,
	createEnvironment,
	updateEnvironment,
	deleteEnvironment,
} from "@/app/actions/environment-actions";
import {
	listScopes,
	createScope,
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
		editingEnvId,
		editingEnvName,
		envError,
		scopeError,
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
		adminClientsSaving,
	} = state;

	const logoInputRef = useRef<HTMLInputElement>(null);

	const envById = new Map(environments.map((e) => [e.id, e.name]));

	const load = async () => {
		dispatch({ type: SetupPageActionType.SET_LOADING, data: true });
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
			dispatch({ type: SetupPageActionType.SET_LOADING, data: false });
		}
	};

	useEffect(() => {
		load();
	}, [dispatch]);

	const handleCreateEnv = async (e: React.FormEvent) => {
		e.preventDefault();
		dispatch({ type: SetupPageActionType.SET_ENV_ERROR, data: null });
		const name = envName.trim();
		if (!name) return;
		try {
			await createEnvironment(name);
			dispatch({ type: SetupPageActionType.SET_ENV_NAME, data: "" });
			await load();
		} catch (err) {
			dispatch({
				type: SetupPageActionType.SET_ENV_ERROR,
				data: err instanceof Error ? err.message : "Failed to create environment",
			});
		}
	};

	const handleUpdateEnv = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!editingEnvId) return;
		dispatch({ type: SetupPageActionType.SET_ENV_ERROR, data: null });
		try {
			const result = await updateEnvironment(editingEnvId, editingEnvName.trim());
			if (result) {
				dispatch({ type: SetupPageActionType.SET_EDITING_ENV_ID, data: null });
				dispatch({ type: SetupPageActionType.SET_EDITING_ENV_NAME, data: "" });
				await load();
			}
		} catch (err) {
			dispatch({
				type: SetupPageActionType.SET_ENV_ERROR,
				data: err instanceof Error ? err.message : "Failed to update environment",
			});
		}
	};

	const handleDeleteEnv = async (id: string) => {
		dispatch({ type: SetupPageActionType.SET_ENV_ERROR, data: null });
		try {
			const result = await deleteEnvironment(id);
			if (result.ok) {
				await load();
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
		}
	};

	const handleCreateScope = async (e: React.FormEvent) => {
		e.preventDefault();
		dispatch({ type: SetupPageActionType.SET_SCOPE_ERROR, data: null });
		const name = scopeName.trim();
		if (!name) return;
		try {
			await createScope(name);
			dispatch({ type: SetupPageActionType.SET_SCOPE_NAME, data: "" });
			await load();
		} catch (err) {
			dispatch({
				type: SetupPageActionType.SET_SCOPE_ERROR,
				data: err instanceof Error ? err.message : "Failed to create scope",
			});
		}
	};

	const handleDeleteScope = async (id: string) => {
		dispatch({ type: SetupPageActionType.SET_SCOPE_ERROR, data: null });
		try {
			const result = await deleteScope(id);
			if (result.ok) {
				await load();
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
			await load();
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
			await load();
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
			await load();
			return true;
		} catch (err) {
			dispatch({
				type: SetupPageActionType.SET_PASSWORD_POLICY_ERROR,
				data: err instanceof Error ? err.message : "Failed to delete policy",
			});
			return false;
		}
	};

	const handleSaveSite = async (e: React.FormEvent) => {
		e.preventDefault();
		dispatch({ type: SetupPageActionType.SET_SITE_ERROR, data: null });
		dispatch({ type: SetupPageActionType.SET_SITE_SAVING, data: true });
		try {
			const dto = await updateSiteSettings({
				siteTitle: siteTitleInput.trim() || null,
				siteUrl: siteUrlInput.trim() || null,
				cdnUrl: cdnUrlInput.trim() || null,
				mfaEnabled: mfaEnabledInput,
			});
			dispatch({ type: SetupPageActionType.SET_SITE_SETTINGS, data: dto });
		} catch (err) {
			dispatch({
				type: SetupPageActionType.SET_SITE_ERROR,
				data: err instanceof Error ? err.message : "Failed to save site settings",
			});
		} finally {
			dispatch({ type: SetupPageActionType.SET_SITE_SAVING, data: false });
		}
	};

	const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file) return;
		dispatch({ type: SetupPageActionType.SET_SITE_ERROR, data: null });
		dispatch({ type: SetupPageActionType.SET_LOGO_UPLOADING, data: true });
		try {
			const body = new FormData();
			body.set("file", file);
			const res = await fetch("/api/admin/site-logo", {
				method: "POST",
				body,
			});
			const json = (await res.json()) as { settings?: SiteSettingsDto; error?: string };
			if (!res.ok) {
				throw new Error(
					(json as { error_description?: string }).error_description ?? json.error ?? "Upload failed"
				);
			}
			if (json.settings) {
				dispatch({ type: SetupPageActionType.SET_SITE_SETTINGS, data: json.settings });
			} else {
				const dto = await getSiteSettings();
				dispatch({ type: SetupPageActionType.SET_SITE_SETTINGS, data: dto });
			}
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
			<div className="flex items-center gap-2 text-xl font-semibold">
				<Settings className="h-6 w-6" />
				Setup
			</div>

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

			<EnvironmentsSection
				activeTab={activeTab}
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

			<ScopesSection
				activeTab={activeTab}
				scopes={scopes}
				scopeName={scopeName}
				scopeError={scopeError}
				dispatch={dispatch}
				onCreate={handleCreateScope}
				onDelete={handleDeleteScope}
			/>

			<PasswordPoliciesSection
				activeTab={activeTab}
				policies={passwordPolicies}
				environments={environments}
				error={passwordPolicyError}
				onClearError={() =>
					dispatch({ type: SetupPageActionType.SET_PASSWORD_POLICY_ERROR, data: null })
				}
				onCreate={handleCreatePolicy}
				onUpdate={handleUpdatePolicy}
				onDelete={handleDeletePolicy}
			/>
		</main>
	);
}
