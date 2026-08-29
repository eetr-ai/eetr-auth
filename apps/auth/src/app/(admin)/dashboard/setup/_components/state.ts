import { ReducerAction } from "@eetr/react-reducer-utils";
import type { SiteSettingsDto } from "@/lib/services/site-settings.service";
import type { Environment } from "@/lib/repositories/environment.repository";
import type { Scope } from "@/lib/repositories/scope.repository";
import { emptyEnvironmentDraft, type EnvironmentDraft } from "./environment-draft";
import { emptyScopeDraft, type ScopeDraft } from "./scope-draft";
import type { PasswordPolicyWithEnvironments } from "@/lib/repositories/password-policy.repository";

export interface ClientListItem {
	id: string;
	clientId: string;
	name: string | null;
	environmentId: string;
}

export type SetupTabId =
	/** Environments + scopes, side by side. The landing tab. */
	| "basic"
	| "site"
	| "admin-api"
	| "password-policies";

export enum SetupPageActionType {
	SET_ACTIVE_TAB = "SET_ACTIVE_TAB",
	SET_ENVIRONMENTS = "SET_ENVIRONMENTS",
	SET_SCOPES = "SET_SCOPES",
	SET_PASSWORD_POLICIES = "SET_PASSWORD_POLICIES",
	SET_PASSWORD_POLICY_ERROR = "SET_PASSWORD_POLICY_ERROR",
	SET_LOADING = "SET_LOADING",
	SET_ENV_PANEL = "SET_ENV_PANEL",
	SET_ENV_DRAFT = "SET_ENV_DRAFT",
	SET_ENV_CONFIRMING_DISCARD = "SET_ENV_CONFIRMING_DISCARD",
	SET_SCOPE_PANEL = "SET_SCOPE_PANEL",
	SET_SCOPE_DRAFT = "SET_SCOPE_DRAFT",
	SET_SCOPE_CONFIRMING_DISCARD = "SET_SCOPE_CONFIRMING_DISCARD",
	SET_ENV_ERROR = "SET_ENV_ERROR",
	SET_ENV_SAVING = "SET_ENV_SAVING",
	SET_SCOPE_ERROR = "SET_SCOPE_ERROR",
	SET_SCOPE_SAVING = "SET_SCOPE_SAVING",
	SET_SITE_SETTINGS = "SET_SITE_SETTINGS",
	SET_SITE_TITLE_INPUT = "SET_SITE_TITLE_INPUT",
	SET_SITE_URL_INPUT = "SET_SITE_URL_INPUT",
	SET_CDN_URL_INPUT = "SET_CDN_URL_INPUT",
	SET_MFA_ENABLED_INPUT = "SET_MFA_ENABLED_INPUT",
	SET_CLIENTS = "SET_CLIENTS",
	SET_SELECTED_ADMIN_CLIENT_IDS = "SET_SELECTED_ADMIN_CLIENT_IDS",
	SET_SITE_ERROR = "SET_SITE_ERROR",
	SET_ADMIN_CLIENTS_ERROR = "SET_ADMIN_CLIENTS_ERROR",
	SET_SITE_SAVING = "SET_SITE_SAVING",
	SET_LOGO_UPLOADING = "SET_LOGO_UPLOADING",
	SET_STAGED_LOGO = "SET_STAGED_LOGO",
	SET_ADMIN_CLIENTS_SAVING = "SET_ADMIN_CLIENTS_SAVING",
}

export interface SetupPageState {
	activeTab: SetupTabId;
	environments: Environment[];
	scopes: Scope[];
	passwordPolicies: PasswordPolicyWithEnvironments[];
	passwordPolicyError: string | null;
	loading: boolean;
	/** Environment side panel. `editingId` is null while creating. */
	envPanelOpen: boolean;
	envEditingId: string | null;
	envDraft: EnvironmentDraft;
	/** The persisted projection the draft is compared against for the dirty guard. */
	envBaseline: EnvironmentDraft;
	envConfirmingDiscard: boolean;
	/** Scope side panel. `editingId` is null while creating. */
	scopePanelOpen: boolean;
	scopeEditingId: string | null;
	scopeDraft: ScopeDraft;
	scopeBaseline: ScopeDraft;
	scopeConfirmingDiscard: boolean;
	envError: string | null;
	/** In flight for an environment create/update/delete, to block double submits. */
	envSaving: boolean;
	scopeError: string | null;
	/** In flight for a scope create/delete, to block double submits. */
	scopeSaving: boolean;
	siteSettings: SiteSettingsDto | null;
	siteTitleInput: string;
	siteUrlInput: string;
	cdnUrlInput: string;
	mfaEnabledInput: boolean;
	clients: ClientListItem[];
	selectedAdminClientIds: string[];
	siteError: string | null;
	adminClientsError: string | null;
	siteSaving: boolean;
	logoUploading: boolean;
	/** A `staging/` key for a picked-but-unsaved logo, promoted when the form saves. */
	logoStagedKey: string | null;
	/** Local object URL previewing that file before it is saved. */
	logoPreviewUrl: string | null;
	adminClientsSaving: boolean;
}

export const initialState: SetupPageState = {
	activeTab: "basic",
	environments: [],
	scopes: [],
	passwordPolicies: [],
	passwordPolicyError: null,
	loading: true,
	envPanelOpen: false,
	envEditingId: null,
	envDraft: emptyEnvironmentDraft,
	envBaseline: emptyEnvironmentDraft,
	envConfirmingDiscard: false,
	scopePanelOpen: false,
	scopeEditingId: null,
	scopeDraft: emptyScopeDraft,
	scopeBaseline: emptyScopeDraft,
	scopeConfirmingDiscard: false,
	envError: null,
	envSaving: false,
	scopeError: null,
	scopeSaving: false,
	siteSettings: null,
	siteTitleInput: "",
	siteUrlInput: "",
	cdnUrlInput: "",
	mfaEnabledInput: false,
	clients: [],
	selectedAdminClientIds: [],
	siteError: null,
	adminClientsError: null,
	siteSaving: false,
	logoUploading: false,
	logoStagedKey: null,
	logoPreviewUrl: null,
	adminClientsSaving: false,
};

export function reducer(
	state: SetupPageState = initialState,
	action: ReducerAction<SetupPageActionType>
): SetupPageState {
	switch (action.type) {
		case SetupPageActionType.SET_ACTIVE_TAB:
			return { ...state, activeTab: (action.data as SetupTabId) ?? "basic" };
		case SetupPageActionType.SET_ENVIRONMENTS:
			return { ...state, environments: (action.data as Environment[]) ?? [] };
		case SetupPageActionType.SET_SCOPES:
			return { ...state, scopes: (action.data as Scope[]) ?? [] };
		case SetupPageActionType.SET_PASSWORD_POLICIES:
			return {
				...state,
				passwordPolicies: (action.data as PasswordPolicyWithEnvironments[]) ?? [],
			};
		case SetupPageActionType.SET_PASSWORD_POLICY_ERROR:
			return { ...state, passwordPolicyError: (action.data as string | null) ?? null };
		case SetupPageActionType.SET_LOADING:
			return { ...state, loading: (action.data as boolean | undefined) ?? false };
		// Opening the panel sets draft and baseline together, so the dirty guard starts
		// clean whether the panel opened to create or to edit.
		case SetupPageActionType.SET_ENV_PANEL: {
			const data = action.data as
				| { open: boolean; editingId?: string | null; draft?: EnvironmentDraft }
				| undefined;
			const draft = data?.draft ?? state.envDraft;
			return {
				...state,
				envPanelOpen: data?.open ?? false,
				envEditingId: data?.editingId ?? null,
				envDraft: draft,
				envBaseline: data?.draft ? draft : state.envBaseline,
				envConfirmingDiscard: false,
			};
		}
		case SetupPageActionType.SET_ENV_DRAFT:
			return { ...state, envDraft: action.data as EnvironmentDraft };
		case SetupPageActionType.SET_ENV_CONFIRMING_DISCARD:
			return { ...state, envConfirmingDiscard: Boolean(action.data) };
		case SetupPageActionType.SET_SCOPE_PANEL: {
			const data = action.data as
				| { open: boolean; editingId?: string | null; draft?: ScopeDraft }
				| undefined;
			const draft = data?.draft ?? state.scopeDraft;
			return {
				...state,
				scopePanelOpen: data?.open ?? false,
				scopeEditingId: data?.editingId ?? null,
				scopeDraft: draft,
				scopeBaseline: data?.draft ? draft : state.scopeBaseline,
				scopeConfirmingDiscard: false,
			};
		}
		case SetupPageActionType.SET_SCOPE_DRAFT:
			return { ...state, scopeDraft: action.data as ScopeDraft };
		case SetupPageActionType.SET_SCOPE_CONFIRMING_DISCARD:
			return { ...state, scopeConfirmingDiscard: Boolean(action.data) };
		case SetupPageActionType.SET_ENV_ERROR:
			return { ...state, envError: (action.data as string | null) ?? null };
		case SetupPageActionType.SET_ENV_SAVING:
			return { ...state, envSaving: (action.data as boolean | undefined) ?? false };
		case SetupPageActionType.SET_SCOPE_ERROR:
			return { ...state, scopeError: (action.data as string | null) ?? null };
		case SetupPageActionType.SET_SCOPE_SAVING:
			return { ...state, scopeSaving: (action.data as boolean | undefined) ?? false };
		case SetupPageActionType.SET_SITE_SETTINGS: {
			const dto = action.data as SiteSettingsDto | null;
			return {
				...state,
				siteSettings: dto,
				siteTitleInput: dto?.siteTitle ?? "",
				siteUrlInput: dto?.siteUrl ?? "",
				cdnUrlInput: dto?.cdnUrl ?? "",
				mfaEnabledInput: dto?.mfaEnabled ?? false,
			};
		}
		case SetupPageActionType.SET_SITE_TITLE_INPUT:
			return { ...state, siteTitleInput: (action.data as string) ?? "" };
		case SetupPageActionType.SET_SITE_URL_INPUT:
			return { ...state, siteUrlInput: (action.data as string) ?? "" };
		case SetupPageActionType.SET_CDN_URL_INPUT:
			return { ...state, cdnUrlInput: (action.data as string) ?? "" };
		case SetupPageActionType.SET_MFA_ENABLED_INPUT:
			return { ...state, mfaEnabledInput: Boolean(action.data) };
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
		case SetupPageActionType.SET_STAGED_LOGO: {
			const data = action.data as { key: string | null; previewUrl: string | null } | undefined;
			return { ...state, logoStagedKey: data?.key ?? null, logoPreviewUrl: data?.previewUrl ?? null };
		}
		case SetupPageActionType.SET_LOGO_UPLOADING:
			return { ...state, logoUploading: (action.data as boolean | undefined) ?? false };
		case SetupPageActionType.SET_ADMIN_CLIENTS_SAVING:
			return { ...state, adminClientsSaving: (action.data as boolean | undefined) ?? false };
		default:
			return state;
	}
}
