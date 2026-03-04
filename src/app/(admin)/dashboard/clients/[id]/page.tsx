"use client";

import { ReducerAction, bootstrapProvider } from "@eetr/react-reducer-utils";
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
	KeyRound,
	ArrowLeft,
	Loader2,
	Trash2,
	RefreshCw,
	Copy,
	Check,
	Plus,
	Ban,
} from "lucide-react";
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
import type { ClientWithDetails } from "@/lib/repositories/client.repository";
import type { Environment } from "@/lib/repositories/environment.repository";
import type { Scope } from "@/lib/repositories/scope.repository";

interface TokenActivityItem {
	tokenType: "access" | "refresh";
	tokenId: string;
	clientId: string;
	environmentId: string;
	expiresAt: string;
	status: "active" | "expired" | "revoked";
	scopeNames: string[];
	createdAt: string | null;
	rotatedFromTokenId: string | null;
}

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

function maskToken(token: string): string {
	if (token.length <= 12) return token;
	return `${token.slice(0, 8)}...${token.slice(-4)}`;
}

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
		return (
			<main className="flex min-h-screen items-center justify-center p-6">
				<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
			</main>
		);
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

			{error && (
				<p className="mb-4 rounded-xl bg-red-950/50 px-3 py-2 text-sm text-red-200">
					{error}
				</p>
			)}

			{rotatedSecret && (
				<div className="mb-6 rounded-xl border border-amber-600/50 bg-amber-950/30 p-4">
					<p className="mb-2 text-sm font-medium text-amber-200">
						New client secret. Copy it now — it will not be shown again.
					</p>
					<div className="flex items-center gap-2">
						<code className="flex-1 rounded border border-brand-muted bg-background px-2 py-1 text-sm">
							{rotatedSecret}
						</code>
						<button
							type="button"
							onClick={copySecret}
							className="rounded-full p-1.5 hover:bg-brand-muted/30"
							aria-label="Copy secret"
						>
							{copied ? (
								<Check className="h-4 w-4 text-green-400" />
							) : (
								<Copy className="h-4 w-4" />
							)}
						</button>
					</div>
					<button
						type="button"
						onClick={() =>
							dispatch({ type: ClientDetailActionType.SET_ROTATED_SECRET, data: null })
						}
						className="mt-2 text-sm text-muted-foreground underline hover:text-foreground"
					>
						Dismiss
					</button>
				</div>
			)}

			<div className="space-y-6">
				<section className="rounded-xl border border-brand-muted p-6">
					<h2 className="mb-3 text-lg font-medium">
						{client.name ? `${client.name}` : "Client details"}
					</h2>
					<div className="mb-3">
						<label className="mb-1 block text-sm font-medium">Name</label>
						<form onSubmit={handleSaveName} className="flex gap-2">
							<input
								type="text"
								value={name}
								onChange={(e) =>
									dispatch({ type: ClientDetailActionType.SET_NAME, data: e.target.value })
								}
								placeholder="e.g. Production API"
								className="flex-1 rounded-xl border border-brand-muted bg-background px-3 py-2 text-foreground placeholder:text-foreground/50 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
							/>
							<button
								type="submit"
								disabled={savingName}
								className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-muted disabled:opacity-50"
							>
								{savingName ? "Saving…" : "Save name"}
							</button>
						</form>
					</div>
					<p className="mb-1 text-sm font-medium">Client ID</p>
					<code className="block rounded border border-brand-muted bg-background px-3 py-2 font-mono text-sm">
						{client.clientId}
					</code>
					<p className="mt-2 text-sm text-muted-foreground">
						Environment: {envById[client.environmentId]?.name ?? client.environmentId}
					</p>
					{client.expiresAt && (
						<p className="text-sm text-muted-foreground">
							Expires: {new Date(client.expiresAt).toLocaleString()}
						</p>
					)}
					<div className="mt-4 flex gap-2">
						<button
							type="button"
							onClick={handleRotateSecret}
							disabled={rotating}
							className="flex items-center gap-2 rounded-full border border-brand-muted px-3 py-2 text-sm font-medium hover:bg-brand-muted/30 disabled:opacity-50"
						>
							<RefreshCw className={`h-4 w-4 ${rotating ? "animate-spin" : ""}`} />
							Rotate secret
						</button>
						<button
							type="button"
							onClick={handleDelete}
							className="flex items-center gap-2 rounded-full border border-red-800 px-3 py-2 text-sm font-medium text-red-200 hover:bg-red-950/50"
						>
							<Trash2 className="h-4 w-4" />
							Delete client
						</button>
					</div>
				</section>

				<section className="rounded-xl border border-brand-muted p-6">
					<h2 className="mb-3 text-lg font-medium">Redirect URIs</h2>
					<form onSubmit={handleSaveUris} className="space-y-2">
						{redirectUris.map((uri, i) => (
							<div key={i} className="flex gap-2">
								<input
									type="url"
									value={uri}
									onChange={(e) => setUriAt(i, e.target.value)}
									placeholder="https://..."
									className="flex-1 rounded-xl border border-brand-muted bg-background px-3 py-2 text-foreground placeholder:text-foreground/50 focus:border-brand focus:outline-none"
								/>
								<button
									type="button"
									onClick={() => removeUri(i)}
									className="rounded-full p-2 text-muted-foreground hover:bg-red-950/50 hover:text-red-200"
									aria-label="Remove"
								>
									<Trash2 className="h-4 w-4" />
								</button>
							</div>
						))}
						<button
							type="button"
							onClick={addUri}
							className="flex items-center gap-1 text-sm text-brand hover:underline"
						>
							<Plus className="h-4 w-4" />
							Add URI
						</button>
						<button
							type="submit"
							disabled={savingUris}
							className="mt-2 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-muted disabled:opacity-50"
						>
							{savingUris ? "Saving…" : "Save redirect URIs"}
						</button>
					</form>
				</section>

				<section className="rounded-xl border border-brand-muted p-6">
					<h2 className="mb-3 text-lg font-medium">Scopes</h2>
					<form onSubmit={handleSaveScopes} className="space-y-2">
						<div className="flex flex-wrap gap-3">
							{scopes.map((s) => (
								<label key={s.id} className="flex cursor-pointer items-center gap-2">
									<input
										type="checkbox"
										checked={scopeIds.includes(s.id)}
										onChange={() => toggleScope(s.id)}
										className="rounded border-brand-muted"
									/>
									<span className="text-sm">{s.scopeName}</span>
								</label>
							))}
							{scopes.length === 0 && (
								<span className="text-sm text-muted-foreground">
									No scopes defined. Add them in Setup.
								</span>
							)}
						</div>
						<button
							type="submit"
							disabled={savingScopes}
							className="mt-2 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-muted disabled:opacity-50"
						>
							{savingScopes ? "Saving…" : "Save scopes"}
						</button>
					</form>
				</section>

				<section className="rounded-xl border border-brand-muted p-6">
					<h2 className="mb-3 text-lg font-medium">Issued Tokens</h2>
					<div className="overflow-x-auto rounded-xl border border-brand-muted">
						<table className="w-full min-w-[760px] text-left text-sm">
							<thead>
								<tr className="border-b border-brand-muted bg-brand-muted/20">
									<th className="px-4 py-3 font-medium">Type</th>
									<th className="px-4 py-3 font-medium">Token</th>
									<th className="px-4 py-3 font-medium">Scopes</th>
									<th className="px-4 py-3 font-medium">Status</th>
									<th className="px-4 py-3 font-medium">Created</th>
									<th className="px-4 py-3 font-medium">Expires</th>
									<th className="px-4 py-3 font-medium">Actions</th>
								</tr>
							</thead>
							<tbody>
								{tokens.map((token) => (
									<tr
										key={`${token.tokenType}-${token.tokenId}`}
										className="border-b border-brand-muted/50"
									>
										<td className="px-4 py-3 uppercase">{token.tokenType}</td>
										<td className="px-4 py-3 font-mono text-xs">
											{maskToken(token.tokenId)}
										</td>
										<td className="px-4 py-3">
											{token.scopeNames.length > 0
												? token.scopeNames.join(" ")
												: <span className="text-muted-foreground">none</span>}
										</td>
										<td className="px-4 py-3">{token.status}</td>
										<td className="px-4 py-3">
											{token.createdAt ? new Date(token.createdAt).toLocaleString() : "n/a"}
										</td>
										<td className="px-4 py-3">
											{new Date(token.expiresAt).toLocaleString()}
										</td>
										<td className="px-4 py-3">
											<div className="flex items-center gap-2">
												<button
													type="button"
													onClick={() => handleRevokeToken(token)}
													disabled={tokenActionKey != null}
													className="inline-flex items-center gap-1 rounded-full border border-amber-700 px-2 py-1 text-xs text-amber-200 hover:bg-amber-950/50 disabled:opacity-50"
												>
													<Ban className="h-3.5 w-3.5" />
													Revoke
												</button>
												<button
													type="button"
													onClick={() => handleDeleteToken(token)}
													disabled={tokenActionKey != null}
													className="inline-flex items-center gap-1 rounded-full border border-red-800 px-2 py-1 text-xs text-red-200 hover:bg-red-950/50 disabled:opacity-50"
												>
													<Trash2 className="h-3.5 w-3.5" />
													Delete
												</button>
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					{tokens.length === 0 && (
						<p className="mt-3 text-sm text-muted-foreground">
							No tokens have been issued for this client yet.
						</p>
					)}
				</section>
			</div>
		</main>
	);
}
