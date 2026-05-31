"use client";

import { ReducerAction, bootstrapProvider } from "@eetr/react-reducer-utils";
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { KeyRound, ArrowLeft } from "lucide-react";
import {
	getClientWithDetails,
	updateClientRedirectUris,
	updateClientScopes,
	updateClientName,
	deleteClient,
	rotateClientSecret,
} from "@/app/actions/client-actions";
import {
	listTokenActivityByClient,
	revokeTokenByValue,
	deleteTokenByValue,
} from "@/app/actions/token-actions";
import { listEnvironments } from "@/app/actions/environment-actions";
import { listScopes } from "@/app/actions/scope-actions";
import { Banner, FullPageSpinner } from "@/components/ui";
import type { ClientWithDetails } from "@/lib/repositories/client.repository";
import type { Environment } from "@/lib/repositories/environment.repository";
import type { Scope } from "@/lib/repositories/scope.repository";
import { ClientInfoSection } from "./_components/client-info-section";
import { RedirectUrisSection } from "./_components/redirect-uris-section";
import { ScopesSection } from "./_components/scopes-section";
import { TokensSection } from "./_components/tokens-section";
import { RotatedSecretBanner } from "./_components/rotated-secret-banner";
import type { TokenActivityItem } from "./_components/token-row";

enum ClientDetailActionType {
	SET_CLIENT = "SET_CLIENT",
	SET_ENVIRONMENTS = "SET_ENVIRONMENTS",
	SET_SCOPES = "SET_SCOPES",
	SET_TOKENS = "SET_TOKENS",
	SET_LOADING = "SET_LOADING",
	SET_REDIRECT_URIS = "SET_REDIRECT_URIS",
	SET_SCOPE_IDS = "SET_SCOPE_IDS",
	SET_NAME = "SET_NAME",
	SET_SAVING_NAME = "SET_SAVING_NAME",
	SET_SAVING_URIS = "SET_SAVING_URIS",
	SET_SAVING_SCOPES = "SET_SAVING_SCOPES",
	SET_ROTATING = "SET_ROTATING",
	SET_ROTATED_SECRET = "SET_ROTATED_SECRET",
	SET_COPIED = "SET_COPIED",
	SET_ERROR = "SET_ERROR",
	SET_TOKEN_ACTION_KEY = "SET_TOKEN_ACTION_KEY",
}

interface ClientDetailState {
	client: ClientWithDetails | null;
	environments: Environment[];
	scopes: Scope[];
	tokens: TokenActivityItem[];
	loading: boolean;
	redirectUris: string[];
	scopeIds: string[];
	name: string;
	savingName: boolean;
	savingUris: boolean;
	savingScopes: boolean;
	rotating: boolean;
	rotatedSecret: string | null;
	copied: boolean;
	error: string | null;
	tokenActionKey: string | null;
}

const initialState: ClientDetailState = {
	client: null,
	environments: [],
	scopes: [],
	tokens: [],
	loading: true,
	redirectUris: [],
	scopeIds: [],
	name: "",
	savingName: false,
	savingUris: false,
	savingScopes: false,
	rotating: false,
	rotatedSecret: null,
	copied: false,
	error: null,
	tokenActionKey: null,
};

function reducer(
	state: ClientDetailState = initialState,
	action: ReducerAction<ClientDetailActionType>
): ClientDetailState {
	switch (action.type) {
		case ClientDetailActionType.SET_CLIENT:
			return { ...state, client: (action.data as ClientWithDetails | null) ?? null };
		case ClientDetailActionType.SET_ENVIRONMENTS:
			return { ...state, environments: (action.data as Environment[]) ?? [] };
		case ClientDetailActionType.SET_SCOPES:
			return { ...state, scopes: (action.data as Scope[]) ?? [] };
		case ClientDetailActionType.SET_TOKENS:
			return { ...state, tokens: (action.data as TokenActivityItem[]) ?? [] };
		case ClientDetailActionType.SET_LOADING:
			return { ...state, loading: (action.data as boolean | undefined) ?? false };
		case ClientDetailActionType.SET_REDIRECT_URIS:
			return { ...state, redirectUris: (action.data as string[]) ?? [] };
		case ClientDetailActionType.SET_SCOPE_IDS:
			return { ...state, scopeIds: (action.data as string[]) ?? [] };
		case ClientDetailActionType.SET_NAME:
			return { ...state, name: (action.data as string) ?? "" };
		case ClientDetailActionType.SET_SAVING_NAME:
			return { ...state, savingName: (action.data as boolean | undefined) ?? false };
		case ClientDetailActionType.SET_SAVING_URIS:
			return { ...state, savingUris: (action.data as boolean | undefined) ?? false };
		case ClientDetailActionType.SET_SAVING_SCOPES:
			return { ...state, savingScopes: (action.data as boolean | undefined) ?? false };
		case ClientDetailActionType.SET_ROTATING:
			return { ...state, rotating: (action.data as boolean | undefined) ?? false };
		case ClientDetailActionType.SET_ROTATED_SECRET:
			return { ...state, rotatedSecret: (action.data as string | null) ?? null };
		case ClientDetailActionType.SET_COPIED:
			return { ...state, copied: (action.data as boolean | undefined) ?? false };
		case ClientDetailActionType.SET_ERROR:
			return { ...state, error: (action.data as string | null) ?? null };
		case ClientDetailActionType.SET_TOKEN_ACTION_KEY:
			return { ...state, tokenActionKey: (action.data as string | null) ?? null };
		default:
			return state;
	}
}

const { Provider: ClientDetailStateProvider, useContextAccessors: useClientDetailState } =
	bootstrapProvider<ClientDetailState, ReducerAction<ClientDetailActionType>>(
		reducer,
		initialState
	);

export default function ClientDetailPage() {
	return (
		<ClientDetailStateProvider>
			<ClientDetailPageContent />
		</ClientDetailStateProvider>
	);
}

function ClientDetailPageContent() {
	const params = useParams();
	const router = useRouter();
	const id = params.id as string;
	const { state, dispatch } = useClientDetailState();
	const {
		client,
		environments,
		scopes,
		tokens,
		loading,
		redirectUris,
		scopeIds,
		name,
		savingName,
		savingUris,
		savingScopes,
		rotating,
		rotatedSecret,
		copied,
		error,
		tokenActionKey,
	} = state;

	useEffect(() => {
		async function load() {
			dispatch({ type: ClientDetailActionType.SET_LOADING, data: true });
			dispatch({ type: ClientDetailActionType.SET_ERROR, data: null });
			try {
				const [details, envs, scopesList, tokenItems] = await Promise.all([
					getClientWithDetails(id),
					listEnvironments(),
					listScopes(),
					listTokenActivityByClient(id),
				]);
				if (details) {
					dispatch({ type: ClientDetailActionType.SET_CLIENT, data: details });
					dispatch({ type: ClientDetailActionType.SET_NAME, data: details.name ?? "" });
					dispatch({
						type: ClientDetailActionType.SET_REDIRECT_URIS,
						data: details.redirectUris.length > 0 ? details.redirectUris : [""],
					});
					dispatch({ type: ClientDetailActionType.SET_SCOPE_IDS, data: details.scopeIds });
				} else {
					dispatch({ type: ClientDetailActionType.SET_CLIENT, data: null });
				}
				dispatch({ type: ClientDetailActionType.SET_ENVIRONMENTS, data: envs });
				dispatch({ type: ClientDetailActionType.SET_SCOPES, data: scopesList });
				dispatch({ type: ClientDetailActionType.SET_TOKENS, data: tokenItems });
			} catch (err) {
				dispatch({
					type: ClientDetailActionType.SET_ERROR,
					data: err instanceof Error ? err.message : "Failed to load client",
				});
			} finally {
				dispatch({ type: ClientDetailActionType.SET_LOADING, data: false });
			}
		}
		load();
	}, [dispatch, id]);

	const envById = Object.fromEntries(environments.map((e) => [e.id, e]));

	const handleSaveUris = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!client) return;
		dispatch({ type: ClientDetailActionType.SET_SAVING_URIS, data: true });
		dispatch({ type: ClientDetailActionType.SET_ERROR, data: null });
		try {
			const uris = redirectUris.filter((u) => u?.trim());
			const updated = await updateClientRedirectUris(id, uris);
			if (updated) {
				dispatch({ type: ClientDetailActionType.SET_CLIENT, data: updated });
				dispatch({
					type: ClientDetailActionType.SET_REDIRECT_URIS,
					data: uris.length > 0 ? uris : [""],
				});
			}
		} catch (err) {
			dispatch({
				type: ClientDetailActionType.SET_ERROR,
				data: err instanceof Error ? err.message : "Failed to update redirect URIs",
			});
		} finally {
			dispatch({ type: ClientDetailActionType.SET_SAVING_URIS, data: false });
		}
	};

	const handleSaveScopes = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!client) return;
		dispatch({ type: ClientDetailActionType.SET_SAVING_SCOPES, data: true });
		dispatch({ type: ClientDetailActionType.SET_ERROR, data: null });
		try {
			const updated = await updateClientScopes(id, scopeIds);
			if (updated) {
				dispatch({ type: ClientDetailActionType.SET_CLIENT, data: updated });
			}
		} catch (err) {
			dispatch({
				type: ClientDetailActionType.SET_ERROR,
				data: err instanceof Error ? err.message : "Failed to update scopes",
			});
		} finally {
			dispatch({ type: ClientDetailActionType.SET_SAVING_SCOPES, data: false });
		}
	};

	const handleSaveName = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!client) return;
		dispatch({ type: ClientDetailActionType.SET_SAVING_NAME, data: true });
		dispatch({ type: ClientDetailActionType.SET_ERROR, data: null });
		try {
			const value = name.trim() || null;
			const updated = await updateClientName(id, value);
			if (updated) {
				dispatch({ type: ClientDetailActionType.SET_CLIENT, data: updated });
				dispatch({ type: ClientDetailActionType.SET_NAME, data: updated.name ?? "" });
			}
		} catch (err) {
			dispatch({
				type: ClientDetailActionType.SET_ERROR,
				data: err instanceof Error ? err.message : "Failed to update name",
			});
		} finally {
			dispatch({ type: ClientDetailActionType.SET_SAVING_NAME, data: false });
		}
	};

	const handleRotateSecret = async () => {
		if (!confirm("Generate a new client secret? The current secret will stop working. The new secret will be shown only once."))
			return;
		dispatch({ type: ClientDetailActionType.SET_ROTATING, data: true });
		dispatch({ type: ClientDetailActionType.SET_ERROR, data: null });
		dispatch({ type: ClientDetailActionType.SET_ROTATED_SECRET, data: null });
		try {
			const result = await rotateClientSecret(id);
			if (result) {
				dispatch({
					type: ClientDetailActionType.SET_ROTATED_SECRET,
					data: result.clientSecret,
				});
				dispatch({
					type: ClientDetailActionType.SET_CLIENT,
					data: client ? { ...client, clientSecret: result.clientSecret } : null,
				});
			}
		} catch (err) {
			dispatch({
				type: ClientDetailActionType.SET_ERROR,
				data: err instanceof Error ? err.message : "Failed to rotate secret",
			});
		} finally {
			dispatch({ type: ClientDetailActionType.SET_ROTATING, data: false });
		}
	};

	const handleDelete = async () => {
		if (!confirm("Delete this client? This cannot be undone.")) return;
		try {
			await deleteClient(id);
			router.push("/dashboard/clients");
		} catch (err) {
			dispatch({
				type: ClientDetailActionType.SET_ERROR,
				data: err instanceof Error ? err.message : "Failed to delete client",
			});
		}
	};

	const addUri = () => {
		dispatch({
			type: ClientDetailActionType.SET_REDIRECT_URIS,
			data: [...redirectUris, ""],
		});
	};
	const setUriAt = (i: number, v: string) => {
		const next = [...redirectUris];
		next[i] = v;
		dispatch({ type: ClientDetailActionType.SET_REDIRECT_URIS, data: next });
	};
	const removeUri = (i: number) => {
		dispatch({
			type: ClientDetailActionType.SET_REDIRECT_URIS,
			data: redirectUris.filter((_, j) => j !== i),
		});
	};

	const toggleScope = (scopeId: string) => {
		dispatch({
			type: ClientDetailActionType.SET_SCOPE_IDS,
			data: scopeIds.includes(scopeId)
				? scopeIds.filter((s) => s !== scopeId)
				: [...scopeIds, scopeId],
		});
	};

	const copySecret = async () => {
		if (!rotatedSecret) return;
		await navigator.clipboard.writeText(rotatedSecret);
		dispatch({ type: ClientDetailActionType.SET_COPIED, data: true });
		setTimeout(
			() => dispatch({ type: ClientDetailActionType.SET_COPIED, data: false }),
			2000
		);
	};

	const reloadClientTokens = async () => {
		const tokenItems = await listTokenActivityByClient(id);
		dispatch({ type: ClientDetailActionType.SET_TOKENS, data: tokenItems });
	};

	const handleRevokeToken = async (token: TokenActivityItem) => {
		if (!confirm(`Revoke this ${token.tokenType} token?`)) return;
		const actionKey = `${token.tokenType}:${token.tokenId}:revoke`;
		dispatch({ type: ClientDetailActionType.SET_TOKEN_ACTION_KEY, data: actionKey });
		dispatch({ type: ClientDetailActionType.SET_ERROR, data: null });
		try {
			await revokeTokenByValue(token.tokenId);
			await reloadClientTokens();
		} catch (err) {
			dispatch({
				type: ClientDetailActionType.SET_ERROR,
				data: err instanceof Error ? err.message : "Failed to revoke token",
			});
		} finally {
			dispatch({ type: ClientDetailActionType.SET_TOKEN_ACTION_KEY, data: null });
		}
	};

	const handleDeleteToken = async (token: TokenActivityItem) => {
		if (!confirm(`Delete this ${token.tokenType} token? This cannot be undone.`)) return;
		const actionKey = `${token.tokenType}:${token.tokenId}:delete`;
		dispatch({ type: ClientDetailActionType.SET_TOKEN_ACTION_KEY, data: actionKey });
		dispatch({ type: ClientDetailActionType.SET_ERROR, data: null });
		try {
			await deleteTokenByValue(token.tokenId);
			await reloadClientTokens();
		} catch (err) {
			dispatch({
				type: ClientDetailActionType.SET_ERROR,
				data: err instanceof Error ? err.message : "Failed to delete token",
			});
		} finally {
			dispatch({ type: ClientDetailActionType.SET_TOKEN_ACTION_KEY, data: null });
		}
	};

	if (loading) {
		return <FullPageSpinner />;
	}

	if (!client) {
		return (
			<main className="min-h-screen p-6">
				<p className="text-muted-foreground">Client not found.</p>
				<Link
					href="/dashboard/clients"
					className="mt-2 inline-flex items-center gap-1 text-sm text-brand hover:underline"
				>
					<ArrowLeft className="h-4 w-4" />
					Back to clients
				</Link>
			</main>
		);
	}

	return (
		<main className="min-h-screen p-6 bg-background text-foreground">
			<div className="mb-6 flex items-center gap-4">
				<Link
					href="/dashboard/clients"
					className="flex items-center gap-1 rounded-full border border-brand-muted px-3 py-1.5 text-sm hover:bg-brand-muted/30"
				>
					<ArrowLeft className="h-4 w-4" />
					Clients
				</Link>
				<div className="flex items-center gap-2 text-xl font-semibold">
					<KeyRound className="h-6 w-6" />
					Client details
				</div>
			</div>

			<Banner variant="error" message={error} className="mb-4" />

			{rotatedSecret && (
				<RotatedSecretBanner
					secret={rotatedSecret}
					copied={copied}
					onCopy={copySecret}
					onDismiss={() =>
						dispatch({ type: ClientDetailActionType.SET_ROTATED_SECRET, data: null })
					}
				/>
			)}

			<div className="space-y-6">
				<ClientInfoSection
					client={client}
					envById={envById}
					name={name}
					onNameChange={(value) =>
						dispatch({ type: ClientDetailActionType.SET_NAME, data: value })
					}
					savingName={savingName}
					onSaveName={handleSaveName}
					rotating={rotating}
					onRotateSecret={handleRotateSecret}
					onDelete={handleDelete}
				/>

				<RedirectUrisSection
					redirectUris={redirectUris}
					onUriChange={setUriAt}
					onAddUri={addUri}
					onRemoveUri={removeUri}
					saving={savingUris}
					onSubmit={handleSaveUris}
				/>

				<ScopesSection
					scopes={scopes}
					scopeIds={scopeIds}
					onToggleScope={toggleScope}
					saving={savingScopes}
					onSubmit={handleSaveScopes}
				/>

				<TokensSection
					tokens={tokens}
					tokenActionKey={tokenActionKey}
					onRevoke={handleRevokeToken}
					onDelete={handleDeleteToken}
				/>
			</div>
		</main>
	);
}
