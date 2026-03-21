"use client";

import { ReducerAction, bootstrapProvider } from "@eetr/react-reducer-utils";
import { useEffect, useRef } from "react";
import {
	Settings,
	Plus,
	Pencil,
	Trash2,
	Loader2,
	Upload,
	ImageIcon,
	Globe2,
	KeyRound,
	Layers,
	Tag,
} from "lucide-react";
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

interface ClientListItem {
	id: string;
	clientId: string;
	name: string | null;
	environmentId: string;
}

type SetupTabId = "site" | "admin-api" | "environments" | "scopes";

enum SetupPageActionType {
	SET_ACTIVE_TAB = "SET_ACTIVE_TAB",
	SET_ENVIRONMENTS = "SET_ENVIRONMENTS",
	SET_SCOPES = "SET_SCOPES",
	SET_LOADING = "SET_LOADING",
	SET_ENV_NAME = "SET_ENV_NAME",
	SET_SCOPE_NAME = "SET_SCOPE_NAME",
	SET_EDITING_ENV_ID = "SET_EDITING_ENV_ID",
	SET_EDITING_ENV_NAME = "SET_EDITING_ENV_NAME",
	SET_ENV_ERROR = "SET_ENV_ERROR",
	SET_SCOPE_ERROR = "SET_SCOPE_ERROR",
	SET_SITE_SETTINGS = "SET_SITE_SETTINGS",
	SET_SITE_TITLE_INPUT = "SET_SITE_TITLE_INPUT",
	SET_SITE_URL_INPUT = "SET_SITE_URL_INPUT",
	SET_CDN_URL_INPUT = "SET_CDN_URL_INPUT",
	SET_CLIENTS = "SET_CLIENTS",
	SET_SELECTED_ADMIN_CLIENT_IDS = "SET_SELECTED_ADMIN_CLIENT_IDS",
	SET_SITE_ERROR = "SET_SITE_ERROR",
	SET_ADMIN_CLIENTS_ERROR = "SET_ADMIN_CLIENTS_ERROR",
	SET_SITE_SAVING = "SET_SITE_SAVING",
	SET_LOGO_UPLOADING = "SET_LOGO_UPLOADING",
	SET_ADMIN_CLIENTS_SAVING = "SET_ADMIN_CLIENTS_SAVING",
}

interface SetupPageState {
	activeTab: SetupTabId;
	environments: Environment[];
	scopes: Scope[];
	loading: boolean;
	envName: string;
	scopeName: string;
	editingEnvId: string | null;
	editingEnvName: string;
	envError: string | null;
	scopeError: string | null;
	siteSettings: SiteSettingsDto | null;
	siteTitleInput: string;
	siteUrlInput: string;
	cdnUrlInput: string;
	clients: ClientListItem[];
	selectedAdminClientIds: string[];
	siteError: string | null;
	adminClientsError: string | null;
	siteSaving: boolean;
	logoUploading: boolean;
	adminClientsSaving: boolean;
}

const initialState: SetupPageState = {
	activeTab: "site",
	environments: [],
	scopes: [],
	loading: true,
	envName: "",
	scopeName: "",
	editingEnvId: null,
	editingEnvName: "",
	envError: null,
	scopeError: null,
	siteSettings: null,
	siteTitleInput: "",
	siteUrlInput: "",
	cdnUrlInput: "",
	clients: [],
	selectedAdminClientIds: [],
	siteError: null,
	adminClientsError: null,
	siteSaving: false,
	logoUploading: false,
	adminClientsSaving: false,
};

function reducer(
	state: SetupPageState = initialState,
	action: ReducerAction<SetupPageActionType>
): SetupPageState {
	switch (action.type) {
		case SetupPageActionType.SET_ACTIVE_TAB:
			return { ...state, activeTab: (action.data as SetupTabId) ?? "site" };
		case SetupPageActionType.SET_ENVIRONMENTS:
			return { ...state, environments: (action.data as Environment[]) ?? [] };
		case SetupPageActionType.SET_SCOPES:
			return { ...state, scopes: (action.data as Scope[]) ?? [] };
		case SetupPageActionType.SET_LOADING:
			return { ...state, loading: (action.data as boolean | undefined) ?? false };
		case SetupPageActionType.SET_ENV_NAME:
			return { ...state, envName: (action.data as string) ?? "" };
		case SetupPageActionType.SET_SCOPE_NAME:
			return { ...state, scopeName: (action.data as string) ?? "" };
		case SetupPageActionType.SET_EDITING_ENV_ID:
			return { ...state, editingEnvId: (action.data as string | null) ?? null };
		case SetupPageActionType.SET_EDITING_ENV_NAME:
			return { ...state, editingEnvName: (action.data as string) ?? "" };
		case SetupPageActionType.SET_ENV_ERROR:
			return { ...state, envError: (action.data as string | null) ?? null };
		case SetupPageActionType.SET_SCOPE_ERROR:
			return { ...state, scopeError: (action.data as string | null) ?? null };
		case SetupPageActionType.SET_SITE_SETTINGS: {
			const dto = action.data as SiteSettingsDto | null;
			return {
				...state,
				siteSettings: dto,
				siteTitleInput: dto?.siteTitle ?? "",
				siteUrlInput: dto?.siteUrl ?? "",
				cdnUrlInput: dto?.cdnUrl ?? "",
			};
		}
		case SetupPageActionType.SET_SITE_TITLE_INPUT:
			return { ...state, siteTitleInput: (action.data as string) ?? "" };
		case SetupPageActionType.SET_SITE_URL_INPUT:
			return { ...state, siteUrlInput: (action.data as string) ?? "" };
		case SetupPageActionType.SET_CDN_URL_INPUT:
			return { ...state, cdnUrlInput: (action.data as string) ?? "" };
		case SetupPageActionType.SET_CLIENTS:
			return { ...state, clients: (action.data as ClientListItem[]) ?? [] };
		case SetupPageActionType.SET_SELECTED_ADMIN_CLIENT_IDS:
			return { ...state, selectedAdminClientIds: (action.data as string[]) ?? [] };
		case SetupPageActionType.SET_SITE_ERROR:
			return { ...state, siteError: (action.data as string | null) ?? null };
		case SetupPageActionType.SET_ADMIN_CLIENTS_ERROR:
			return { ...state, adminClientsError: (action.data as string | null) ?? null };
		case SetupPageActionType.SET_SITE_SAVING:
			return { ...state, siteSaving: (action.data as boolean | undefined) ?? false };
		case SetupPageActionType.SET_LOGO_UPLOADING:
			return { ...state, logoUploading: (action.data as boolean | undefined) ?? false };
		case SetupPageActionType.SET_ADMIN_CLIENTS_SAVING:
			return { ...state, adminClientsSaving: (action.data as boolean | undefined) ?? false };
		default:
			return state;
	}
}

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
			const [envs, scopesList, settings, clientsRaw, adminIds] = await Promise.all([
				listEnvironments(),
				listScopes(),
				getSiteSettings(),
				listClients(),
				getAdminApiClientRowIds(),
			]);
			dispatch({ type: SetupPageActionType.SET_ENVIRONMENTS, data: envs });
			dispatch({ type: SetupPageActionType.SET_SCOPES, data: scopesList });
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

	const handleSaveSite = async (e: React.FormEvent) => {
		e.preventDefault();
		dispatch({ type: SetupPageActionType.SET_SITE_ERROR, data: null });
		dispatch({ type: SetupPageActionType.SET_SITE_SAVING, data: true });
		try {
			const dto = await updateSiteSettings({
				siteTitle: siteTitleInput.trim() || null,
				siteUrl: siteUrlInput.trim() || null,
				cdnUrl: cdnUrlInput.trim() || null,
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

	const previewLogoUrl = siteSettings?.displayLogoUrl ?? null;

	const tabs: { id: SetupTabId; label: string; icon: typeof Globe2 }[] = [
		{ id: "site", label: "Site identity", icon: Globe2 },
		{ id: "admin-api", label: "Admin API", icon: KeyRound },
		{ id: "environments", label: "Environments", icon: Layers },
		{ id: "scopes", label: "Scopes", icon: Tag },
	];

	if (loading) {
		return (
			<main className="flex min-h-screen items-center justify-center p-6">
				<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
			</main>
		);
	}

	return (
		<main className="min-h-screen bg-background p-6 text-foreground">
			<div className="flex items-center gap-2 text-xl font-semibold">
				<Settings className="h-6 w-6" />
				Setup
			</div>

			<div
				className="mt-8 flex flex-wrap gap-1 border-b border-brand-muted"
				role="tablist"
				aria-label="Setup sections"
			>
				{tabs.map(({ id, label, icon: Icon }) => {
					const selected = activeTab === id;
					return (
						<button
							key={id}
							type="button"
							role="tab"
							aria-selected={selected}
							id={`setup-tab-${id}`}
							onClick={() =>
								dispatch({ type: SetupPageActionType.SET_ACTIVE_TAB, data: id })
							}
							className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
								selected
									? "border-brand text-foreground"
									: "border-transparent text-muted-foreground hover:text-foreground"
							}`}
						>
							<Icon className="h-4 w-4 shrink-0" />
							{label}
						</button>
					);
				})}
			</div>

			{/* Site identity */}
			<section
				className={`mt-6 rounded-xl border border-brand-muted p-6 ${activeTab !== "site" ? "hidden" : ""}`}
				role="tabpanel"
				id="setup-panel-site"
				aria-labelledby="setup-tab-site"
				aria-hidden={activeTab !== "site"}
			>
				<h2 className="mb-4 text-lg font-medium">Site identity</h2>
				{siteError && (
					<p className="mb-3 rounded-xl bg-red-950/50 px-3 py-2 text-sm text-red-200">
						{siteError}
					</p>
				)}
				<form onSubmit={handleSaveSite} className="space-y-4">
					<div className="grid gap-4 md:grid-cols-2">
						<div>
							<label className="mb-1 block text-sm text-muted-foreground">Site title</label>
							<input
								type="text"
								value={siteTitleInput}
								onChange={(e) =>
									dispatch({
										type: SetupPageActionType.SET_SITE_TITLE_INPUT,
										data: e.target.value,
									})
								}
								placeholder="Eetr Auth"
								className="w-full rounded-xl border border-brand-muted bg-background px-3 py-2 text-foreground placeholder:text-foreground/50 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
							/>
						</div>
						<div>
							<label className="mb-1 block text-sm text-muted-foreground">Site URL</label>
							<input
								type="url"
								value={siteUrlInput}
								onChange={(e) =>
									dispatch({
										type: SetupPageActionType.SET_SITE_URL_INPUT,
										data: e.target.value,
									})
								}
								placeholder="https://example.com"
								className="w-full rounded-xl border border-brand-muted bg-background px-3 py-2 text-foreground placeholder:text-foreground/50 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
							/>
						</div>
						<div className="md:col-span-2">
							<label className="mb-1 block text-sm text-muted-foreground">CDN URL</label>
							<input
								type="url"
								value={cdnUrlInput}
								onChange={(e) =>
									dispatch({
										type: SetupPageActionType.SET_CDN_URL_INPUT,
										data: e.target.value,
									})
								}
								placeholder="https://cdn.example.com"
								className="w-full rounded-xl border border-brand-muted bg-background px-3 py-2 text-foreground placeholder:text-foreground/50 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
							/>
							<p className="mt-1 text-xs text-muted-foreground">
								Used for public URLs to the uploaded site logo. Optional if you only use the default
								static logo.
							</p>
						</div>
					</div>

					<div className="flex flex-wrap items-end gap-4">
						<div>
							<span className="mb-1 block text-sm text-muted-foreground">Logo</span>
							<div className="flex items-center gap-3">
								{previewLogoUrl ? (
									// eslint-disable-next-line @next/next/no-img-element
									<img
										src={previewLogoUrl}
										alt=""
										className="h-14 w-14 rounded-lg border border-brand-muted object-contain"
									/>
								) : (
									<div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-brand-muted">
										<ImageIcon className="h-6 w-6 text-muted-foreground" />
									</div>
								)}
								<input
									ref={logoInputRef}
									type="file"
									accept="image/jpeg,image/png,image/webp"
									className="hidden"
									onChange={handleLogoChange}
								/>
								<button
									type="button"
									disabled={logoUploading}
									onClick={() => logoInputRef.current?.click()}
									className="flex items-center gap-2 rounded-full border border-brand-muted px-4 py-2 text-sm font-medium hover:bg-brand-muted/30 disabled:opacity-50"
								>
									{logoUploading ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : (
										<Upload className="h-4 w-4" />
									)}
									Upload logo
								</button>
								{siteSettings?.logoKey ? (
									<button
										type="button"
										disabled={logoUploading}
										onClick={handleClearLogo}
										className="text-sm text-muted-foreground underline hover:text-foreground disabled:opacity-50"
									>
										Use default logo
									</button>
								) : null}
							</div>
						</div>
					</div>

					<div>
						<button
							type="submit"
							disabled={siteSaving}
							className="rounded-full bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand-muted disabled:opacity-50"
						>
							{siteSaving ? (
								<span className="flex items-center gap-2">
									<Loader2 className="h-4 w-4 animate-spin" /> Saving…
								</span>
							) : (
								"Save site settings"
							)}
						</button>
					</div>
				</form>
			</section>

			{/* Admin API clients */}
			<section
				className={`mt-6 rounded-xl border border-brand-muted p-6 ${activeTab !== "admin-api" ? "hidden" : ""}`}
				role="tabpanel"
				id="setup-panel-admin-api"
				aria-labelledby="setup-tab-admin-api"
				aria-hidden={activeTab !== "admin-api"}
			>
				<h2 className="mb-1 text-lg font-medium">Admin API clients</h2>
				<p className="mb-4 text-sm text-muted-foreground">
					OAuth clients allowed to use the future admin API. Credentials are not shown here.
				</p>
				{adminClientsError && (
					<p className="mb-3 rounded-xl bg-red-950/50 px-3 py-2 text-sm text-red-200">
						{adminClientsError}
					</p>
				)}
				{clients.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No OAuth clients yet. Create clients under Clients first.
					</p>
				) : (
					<ul className="mb-4 max-h-64 space-y-2 overflow-y-auto rounded-xl border border-brand-muted p-3">
						{clients.map((c) => {
							const checked = selectedAdminClientIds.includes(c.id);
							const envLabel = envById.get(c.environmentId) ?? c.environmentId;
							const label = c.name?.trim() ? c.name : c.clientId;
							return (
								<li key={c.id}>
									<label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-brand-muted/20">
										<input
											type="checkbox"
											checked={checked}
											onChange={() => toggleAdminClient(c.id)}
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
				<button
					type="button"
					disabled={adminClientsSaving || clients.length === 0}
					onClick={handleSaveAdminClients}
					className="rounded-full bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand-muted disabled:opacity-50"
				>
					{adminClientsSaving ? (
						<span className="flex items-center gap-2">
							<Loader2 className="h-4 w-4 animate-spin" /> Saving…
						</span>
					) : (
						"Save admin API clients"
					)}
				</button>
			</section>

			{/* Environments */}
			<section
				className={`mt-6 rounded-xl border border-brand-muted p-6 ${activeTab !== "environments" ? "hidden" : ""}`}
				role="tabpanel"
				id="setup-panel-environments"
				aria-labelledby="setup-tab-environments"
				aria-hidden={activeTab !== "environments"}
			>
					<h2 className="mb-4 text-lg font-medium">Environments</h2>
					{envError && (
						<p className="mb-3 rounded-xl bg-red-950/50 px-3 py-2 text-sm text-red-200">
							{envError}
						</p>
					)}
					<form onSubmit={handleCreateEnv} className="mb-4 flex gap-2">
						<input
							type="text"
							value={envName}
							onChange={(e) =>
								dispatch({ type: SetupPageActionType.SET_ENV_NAME, data: e.target.value })
							}
							placeholder="Environment name"
							className="flex-1 rounded-xl border border-brand-muted bg-background px-3 py-2 text-foreground placeholder:text-foreground/50 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
						/>
						<button
							type="submit"
							className="flex items-center gap-1 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-muted"
						>
							<Plus className="h-4 w-4" />
							Add
						</button>
					</form>
					<ul className="space-y-2">
						{environments.map((env) => (
							<li
								key={env.id}
								className="flex items-center justify-between rounded-xl border border-brand-muted px-3 py-2"
							>
								{editingEnvId === env.id ? (
									<form onSubmit={handleUpdateEnv} className="flex flex-1 gap-2">
										<input
											type="text"
											value={editingEnvName}
											onChange={(e) =>
												dispatch({
													type: SetupPageActionType.SET_EDITING_ENV_NAME,
													data: e.target.value,
												})
											}
											className="flex-1 rounded-xl border border-brand-muted bg-background px-2 py-1 text-sm focus:border-brand focus:outline-none"
											autoFocus
										/>
										<button
											type="submit"
											className="rounded-full border border-brand-muted px-2 py-1 text-sm hover:bg-brand-muted/30"
										>
											Save
										</button>
										<button
											type="button"
											onClick={() => {
												dispatch({
													type: SetupPageActionType.SET_EDITING_ENV_ID,
													data: null,
												});
												dispatch({
													type: SetupPageActionType.SET_EDITING_ENV_NAME,
													data: "",
												});
											}}
											className="rounded-full border border-brand-muted px-2 py-1 text-sm hover:bg-brand-muted/30"
										>
											Cancel
										</button>
									</form>
								) : (
									<>
										<span className="font-medium">{env.name}</span>
										<div className="flex gap-1">
											<button
												type="button"
												onClick={() => {
													dispatch({
														type: SetupPageActionType.SET_EDITING_ENV_ID,
														data: env.id,
													});
													dispatch({
														type: SetupPageActionType.SET_EDITING_ENV_NAME,
														data: env.name,
													});
												}}
												className="rounded-full p-1.5 text-muted-foreground hover:bg-brand-muted/30 hover:text-foreground"
												aria-label="Edit"
											>
												<Pencil className="h-4 w-4" />
											</button>
											<button
												type="button"
												onClick={() => handleDeleteEnv(env.id)}
												className="rounded-full p-1.5 text-muted-foreground hover:bg-red-950/50 hover:text-red-200"
												aria-label="Delete"
											>
												<Trash2 className="h-4 w-4" />
											</button>
										</div>
									</>
								)}
							</li>
						))}
						{environments.length === 0 && (
							<li className="py-2 text-sm text-muted-foreground">
								No environments yet. Add one above.
							</li>
						)}
					</ul>
			</section>

			{/* Scopes */}
			<section
				className={`mt-6 rounded-xl border border-brand-muted p-6 ${activeTab !== "scopes" ? "hidden" : ""}`}
				role="tabpanel"
				id="setup-panel-scopes"
				aria-labelledby="setup-tab-scopes"
				aria-hidden={activeTab !== "scopes"}
			>
					<h2 className="mb-4 text-lg font-medium">Scopes</h2>
					{scopeError && (
						<p className="mb-3 rounded-xl bg-red-950/50 px-3 py-2 text-sm text-red-200">
							{scopeError}
						</p>
					)}
					<form onSubmit={handleCreateScope} className="mb-4 flex gap-2">
						<input
							type="text"
							value={scopeName}
							onChange={(e) =>
								dispatch({
									type: SetupPageActionType.SET_SCOPE_NAME,
									data: e.target.value,
								})
							}
							placeholder="Scope name"
							className="flex-1 rounded-xl border border-brand-muted bg-background px-3 py-2 text-foreground placeholder:text-foreground/50 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
						/>
						<button
							type="submit"
							className="flex items-center gap-1 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-muted"
						>
							<Plus className="h-4 w-4" />
							Add
						</button>
					</form>
					<ul className="space-y-2">
						{scopes.map((scope) => (
							<li
								key={scope.id}
								className="flex items-center justify-between rounded-xl border border-brand-muted px-3 py-2"
							>
								<span className="font-medium">{scope.scopeName}</span>
								<button
									type="button"
									onClick={() => handleDeleteScope(scope.id)}
									className="rounded-full p-1.5 text-muted-foreground hover:bg-red-950/50 hover:text-red-200"
									aria-label="Delete"
								>
									<Trash2 className="h-4 w-4" />
								</button>
							</li>
						))}
						{scopes.length === 0 && (
							<li className="py-2 text-sm text-muted-foreground">
								No scopes yet. Add one above.
							</li>
						)}
					</ul>
			</section>
		</main>
	);
}
