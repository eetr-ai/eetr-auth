import { ReducerAction } from "@eetr/react-reducer-utils";
import type { SiteSettingsDto } from "@/lib/services/site-settings.service";
import type { Environment } from "@/lib/repositories/environment.repository";
import type { Scope } from "@/lib/repositories/scope.repository";
import type { PasswordPolicyWithEnvironments } from "@/lib/repositories/password-policy.repository";

export interface ClientListItem {
	id: string;
	clientId: string;
	name: string | null;
	environmentId: string;
}

export type SetupTabId =
	| "site"
	| "admin-api"
	| "environments"
	| "scopes"
	| "password-policies";

export enum SetupPageActionType {
	SET_ACTIVE_TAB = "SET_ACTIVE_TAB",
	SET_ENVIRONMENTS = "SET_ENVIRONMENTS",
	SET_SCOPES = "SET_SCOPES",
	SET_PASSWORD_POLICIES = "SET_PASSWORD_POLICIES",
	SET_PASSWORD_POLICY_ERROR = "SET_PASSWORD_POLICY_ERROR",
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
	SET_MFA_ENABLED_INPUT = "SET_MFA_ENABLED_INPUT",
	SET_CLIENTS = "SET_CLIENTS",
	SET_SELECTED_ADMIN_CLIENT_IDS = "SET_SELECTED_ADMIN_CLIENT_IDS",
	SET_SITE_ERROR = "SET_SITE_ERROR",
	SET_ADMIN_CLIENTS_ERROR = "SET_ADMIN_CLIENTS_ERROR",
	SET_SITE_SAVING = "SET_SITE_SAVING",
	SET_LOGO_UPLOADING = "SET_LOGO_UPLOADING",
	SET_ADMIN_CLIENTS_SAVING = "SET_ADMIN_CLIENTS_SAVING",
}

export interface SetupPageState {
	activeTab: SetupTabId;
	environments: Environment[];
	scopes: Scope[];
	passwordPolicies: PasswordPolicyWithEnvironments[];
	passwordPolicyError: string | null;
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
	mfaEnabledInput: boolean;
	clients: ClientListItem[];
	selectedAdminClientIds: string[];
	siteError: string | null;
	adminClientsError: string | null;
	siteSaving: boolean;
	logoUploading: boolean;
	adminClientsSaving: boolean;
}

export const initialState: SetupPageState = {
	activeTab: "site",
	environments: [],
	scopes: [],
	passwordPolicies: [],
	passwordPolicyError: null,
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
	mfaEnabledInput: false,
	clients: [],
	selectedAdminClientIds: [],
	siteError: null,
	adminClientsError: null,
	siteSaving: false,
	logoUploading: false,
	adminClientsSaving: false,
};

export function reducer(
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
		case SetupPageActionType.SET_PASSWORD_POLICIES:
			return {
				...state,
				passwordPolicies: (action.data as PasswordPolicyWithEnvironments[]) ?? [],
			};
		case SetupPageActionType.SET_PASSWORD_POLICY_ERROR:
			return { ...state, passwordPolicyError: (action.data as string | null) ?? null };
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
		case SetupPageActionType.SET_LOGO_UPLOADING:
			return { ...state, logoUploading: (action.data as boolean | undefined) ?? false };
		case SetupPageActionType.SET_ADMIN_CLIENTS_SAVING:
			return { ...state, adminClientsSaving: (action.data as boolean | undefined) ?? false };
		default:
			return state;
	}
}
