"use client";

import { ReducerAction, bootstrapProvider } from "@eetr/react-reducer-utils";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Fingerprint } from "lucide-react";
import {
	listTokenActivity,
	revokeTokenByValue,
	deleteTokenByValue,
	runCleanupTokenArtifacts,
} from "@/app/actions/token-actions";
import { listEnvironments } from "@/app/actions/environment-actions";
import type { Environment } from "@/lib/repositories/environment.repository";
import { Banner, FullPageSpinner, PageHeader } from "@/components/ui";
import { TokensToolbar } from "./_components/tokens-toolbar";
import { TokensTable, tokenKey } from "@/components/tokens/tokens-table";
import type { TokenAction } from "@/components/tokens/token-row";
import type { TokenActivityItem } from "@/components/tokens/types";

enum TokensPageActionType {
	SET_TOKENS = "SET_TOKENS",
	SET_ENVIRONMENTS = "SET_ENVIRONMENTS",
	SET_LOADING = "SET_LOADING",
	SET_ENVIRONMENT_FILTER = "SET_ENVIRONMENT_FILTER",
	SET_CLIENT_FILTER = "SET_CLIENT_FILTER",
	SET_ERROR = "SET_ERROR",
	SET_TOKEN_ACTION_KEY = "SET_TOKEN_ACTION_KEY",
	SET_CONFIRMING_ACTION = "SET_CONFIRMING_ACTION",
	SET_CONFIRMING_CLEANUP = "SET_CONFIRMING_CLEANUP",
	SET_CLEANUP_RUNNING = "SET_CLEANUP_RUNNING",
	SET_CLEANUP_MESSAGE = "SET_CLEANUP_MESSAGE",
}

interface TokensPageState {
	tokens: TokenActivityItem[];
	environments: Environment[];
	loading: boolean;
	environmentFilter: string;
	/** OAuth client_id, not the client row id. Deep-linked from the client panel. */
	clientFilter: string;
	error: string | null;
	tokenActionKey: string | null;
	/** Row key + action currently awaiting inline confirmation. */
	confirmingAction: { key: string; action: TokenAction } | null;
	/** Cleanup is bulk-destructive, so it confirms inline before running. */
	confirmingCleanup: boolean;
	cleanupRunning: boolean;
	cleanupMessage: string | null;
}

const initialState: TokensPageState = {
	tokens: [],
	environments: [],
	loading: true,
	environmentFilter: "",
	clientFilter: "",
	error: null,
	tokenActionKey: null,
	confirmingAction: null,
	confirmingCleanup: false,
	cleanupRunning: false,
	cleanupMessage: null,
};

function reducer(
	state: TokensPageState = initialState,
	action: ReducerAction<TokensPageActionType>
): TokensPageState {
	switch (action.type) {
		case TokensPageActionType.SET_TOKENS:
			return { ...state, tokens: (action.data as TokenActivityItem[]) ?? [] };
		case TokensPageActionType.SET_ENVIRONMENTS:
			return { ...state, environments: (action.data as Environment[]) ?? [] };
		case TokensPageActionType.SET_LOADING:
			return { ...state, loading: (action.data as boolean | undefined) ?? false };
		case TokensPageActionType.SET_ENVIRONMENT_FILTER:
			return { ...state, environmentFilter: (action.data as string) ?? "" };
		case TokensPageActionType.SET_CLIENT_FILTER:
			return { ...state, clientFilter: (action.data as string) ?? "" };
		case TokensPageActionType.SET_ERROR:
			return { ...state, error: (action.data as string | null) ?? null };
		case TokensPageActionType.SET_TOKEN_ACTION_KEY:
			return { ...state, tokenActionKey: (action.data as string | null) ?? null };
		case TokensPageActionType.SET_CONFIRMING_CLEANUP:
			return { ...state, confirmingCleanup: (action.data as boolean | undefined) ?? false };
		case TokensPageActionType.SET_CONFIRMING_ACTION:
			return {
				...state,
				confirmingAction: (action.data as { key: string; action: TokenAction } | null) ?? null,
			};
		case TokensPageActionType.SET_CLEANUP_RUNNING:
			return { ...state, cleanupRunning: (action.data as boolean | undefined) ?? false };
		case TokensPageActionType.SET_CLEANUP_MESSAGE:
			return { ...state, cleanupMessage: (action.data as string | null) ?? null };
		default:
			return state;
	}
}

const { Provider: TokensPageStateProvider, useContextAccessors: useTokensPageState } =
	bootstrapProvider<TokensPageState, ReducerAction<TokensPageActionType>>(
		reducer,
		initialState
	);

export default function TokensPage() {
	return (
		<TokensPageStateProvider>
			<TokensPageContent />
		</TokensPageStateProvider>
	);
}

function TokensPageContent() {
	const { state, dispatch } = useTokensPageState();
	const {
		tokens,
		environments,
		loading,
		environmentFilter,
		clientFilter,
		error,
		tokenActionKey,
		confirmingAction,
		confirmingCleanup,
		cleanupRunning,
		cleanupMessage,
	} = state;

	// Deep link from the client panel: /dashboard/tokens?client=<oauth client_id>
	const searchParams = useSearchParams();
	const requestedClient = searchParams.get("client");
	useEffect(() => {
		if (requestedClient) {
			dispatch({ type: TokensPageActionType.SET_CLIENT_FILTER, data: requestedClient });
		}
	}, [requestedClient, dispatch]);

	useEffect(() => {
		async function load() {
			dispatch({ type: TokensPageActionType.SET_LOADING, data: true });
			dispatch({ type: TokensPageActionType.SET_ERROR, data: null });
			try {
				const [tokenItems, envs] = await Promise.all([
					listTokenActivity(),
					listEnvironments(),
				]);
				dispatch({ type: TokensPageActionType.SET_TOKENS, data: tokenItems });
				dispatch({ type: TokensPageActionType.SET_ENVIRONMENTS, data: envs });
			} catch (err) {
				dispatch({
					type: TokensPageActionType.SET_ERROR,
					data: err instanceof Error ? err.message : "Failed to load tokens",
				});
			} finally {
				dispatch({ type: TokensPageActionType.SET_LOADING, data: false });
			}
		}
		load();
	}, [dispatch]);

	const reloadTokens = async () => {
		const tokenItems = await listTokenActivity();
		dispatch({ type: TokensPageActionType.SET_TOKENS, data: tokenItems });
	};

	const requestAction = (token: TokenActivityItem, action: TokenAction) => {
		dispatch({ type: TokensPageActionType.SET_ERROR, data: null });
		dispatch({
			type: TokensPageActionType.SET_CONFIRMING_ACTION,
			data: { key: tokenKey(token), action },
		});
	};

	const cancelAction = () =>
		dispatch({ type: TokensPageActionType.SET_CONFIRMING_ACTION, data: null });

	const confirmAction = (token: TokenActivityItem, action: TokenAction) =>
		action === "revoke" ? handleRevoke(token) : handleDelete(token);

	const handleRevoke = async (token: TokenActivityItem) => {
		const actionKey = tokenKey(token);
		dispatch({ type: TokensPageActionType.SET_TOKEN_ACTION_KEY, data: actionKey });
		dispatch({ type: TokensPageActionType.SET_ERROR, data: null });
		try {
			await revokeTokenByValue(token.tokenId);
			dispatch({ type: TokensPageActionType.SET_CONFIRMING_ACTION, data: null });
			await reloadTokens();
		} catch (err) {
			dispatch({
				type: TokensPageActionType.SET_ERROR,
				data: err instanceof Error ? err.message : "Failed to revoke token",
			});
		} finally {
			dispatch({ type: TokensPageActionType.SET_TOKEN_ACTION_KEY, data: null });
		}
	};

	const handleDelete = async (token: TokenActivityItem) => {
		const actionKey = tokenKey(token);
		dispatch({ type: TokensPageActionType.SET_TOKEN_ACTION_KEY, data: actionKey });
		dispatch({ type: TokensPageActionType.SET_ERROR, data: null });
		try {
			await deleteTokenByValue(token.tokenId);
			dispatch({ type: TokensPageActionType.SET_CONFIRMING_ACTION, data: null });
			await reloadTokens();
		} catch (err) {
			dispatch({
				type: TokensPageActionType.SET_ERROR,
				data: err instanceof Error ? err.message : "Failed to delete token",
			});
		} finally {
			dispatch({ type: TokensPageActionType.SET_TOKEN_ACTION_KEY, data: null });
		}
	};

	const handleRunCleanup = async () => {
		dispatch({ type: TokensPageActionType.SET_CONFIRMING_CLEANUP, data: false });
		dispatch({ type: TokensPageActionType.SET_CLEANUP_RUNNING, data: true });
		dispatch({ type: TokensPageActionType.SET_CLEANUP_MESSAGE, data: null });
		try {
			const result = await runCleanupTokenArtifacts();
			if (result.ok) {
				dispatch({
					type: TokensPageActionType.SET_CLEANUP_MESSAGE,
					data: result.totalDeleted !== undefined
						? `Cleanup completed. ${result.totalDeleted} artifact(s) deleted.`
						: "Cleanup completed.",
				});
				await reloadTokens();
			} else {
				dispatch({
					type: TokensPageActionType.SET_CLEANUP_MESSAGE,
					data: result.error ? `Cleanup failed: ${result.error}` : "Cleanup failed.",
				});
			}
		} catch (err) {
			dispatch({
				type: TokensPageActionType.SET_CLEANUP_MESSAGE,
				data: err instanceof Error ? err.message : "Cleanup failed",
			});
		} finally {
			dispatch({ type: TokensPageActionType.SET_CLEANUP_RUNNING, data: false });
		}
	};

	const envById = Object.fromEntries(environments.map((environment) => [environment.id, environment]));
	const filteredTokens = tokens.filter(
		(token) =>
			(!environmentFilter.trim() || token.environmentId === environmentFilter) &&
			(!clientFilter.trim() || token.clientId === clientFilter),
	);

	// Clients that actually appear in the activity list, so the filter never
	// offers an option that would yield nothing.
	const clientOptions = Array.from(
		new Map(tokens.map((token) => [token.clientId, token.clientName ?? token.clientId])).entries(),
	).sort((a, b) => a[1].localeCompare(b[1]));

	if (loading && tokens.length === 0) {
		return <FullPageSpinner />;
	}

	return (
		<main className="flex h-screen flex-col bg-background p-6 text-foreground">
			<PageHeader icon={Fingerprint} title="Tokens" />

			<Banner variant="error" message={error} className="shrink-0" />

			<TokensToolbar
				environments={environments}
				environmentFilter={environmentFilter}
				onEnvironmentFilterChange={(value) =>
					dispatch({ type: TokensPageActionType.SET_ENVIRONMENT_FILTER, data: value })
				}
				clientOptions={clientOptions}
				clientFilter={clientFilter}
				onClientFilterChange={(value) =>
					dispatch({ type: TokensPageActionType.SET_CLIENT_FILTER, data: value })
				}
				cleanupRunning={cleanupRunning}
				cleanupMessage={cleanupMessage}
				confirmingCleanup={confirmingCleanup}
				onRequestCleanup={() =>
					dispatch({ type: TokensPageActionType.SET_CONFIRMING_CLEANUP, data: true })
				}
				onCancelCleanup={() =>
					dispatch({ type: TokensPageActionType.SET_CONFIRMING_CLEANUP, data: false })
				}
				onRunCleanup={handleRunCleanup}
			/>

			<TokensTable
				tokens={filteredTokens}
				envById={envById}
				actionInProgress={tokenActionKey != null}
				confirming={confirmingAction}
				busyKey={tokenActionKey}
				onRequestAction={requestAction}
				onConfirmAction={confirmAction}
				onCancelAction={cancelAction}
			/>

			{filteredTokens.length === 0 && (
				<p className="mt-4 shrink-0 text-center text-sm text-muted-foreground">
					No tokens found for the selected filter.
				</p>
			)}
		</main>
	);
}
