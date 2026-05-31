"use client";

import { ReducerAction, bootstrapProvider } from "@eetr/react-reducer-utils";
import { useEffect } from "react";
import { Fingerprint } from "lucide-react";
import {
	listTokenActivity,
	revokeTokenByValue,
	deleteTokenByValue,
	runCleanupTokenArtifacts,
} from "@/app/actions/token-actions";
import { listEnvironments } from "@/app/actions/environment-actions";
import type { Environment } from "@/lib/repositories/environment.repository";
import { FullPageSpinner } from "@/components/ui";
import { TokensToolbar } from "./_components/tokens-toolbar";
import { TokensTable } from "./_components/tokens-table";
import type { TokenActivityItem } from "./_components/types";

enum TokensPageActionType {
	SET_TOKENS = "SET_TOKENS",
	SET_ENVIRONMENTS = "SET_ENVIRONMENTS",
	SET_LOADING = "SET_LOADING",
	SET_ENVIRONMENT_FILTER = "SET_ENVIRONMENT_FILTER",
	SET_ERROR = "SET_ERROR",
	SET_TOKEN_ACTION_KEY = "SET_TOKEN_ACTION_KEY",
	SET_CLEANUP_RUNNING = "SET_CLEANUP_RUNNING",
	SET_CLEANUP_MESSAGE = "SET_CLEANUP_MESSAGE",
}

interface TokensPageState {
	tokens: TokenActivityItem[];
	environments: Environment[];
	loading: boolean;
	environmentFilter: string;
	error: string | null;
	tokenActionKey: string | null;
	cleanupRunning: boolean;
	cleanupMessage: string | null;
}

const initialState: TokensPageState = {
	tokens: [],
	environments: [],
	loading: true,
	environmentFilter: "",
	error: null,
	tokenActionKey: null,
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
		case TokensPageActionType.SET_ERROR:
			return { ...state, error: (action.data as string | null) ?? null };
		case TokensPageActionType.SET_TOKEN_ACTION_KEY:
			return { ...state, tokenActionKey: (action.data as string | null) ?? null };
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
		error,
		tokenActionKey,
		cleanupRunning,
		cleanupMessage,
	} = state;

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

	const handleRevoke = async (token: TokenActivityItem) => {
		if (!confirm(`Revoke this ${token.tokenType} token?`)) return;
		const actionKey = `${token.tokenType}:${token.tokenId}:revoke`;
		dispatch({ type: TokensPageActionType.SET_TOKEN_ACTION_KEY, data: actionKey });
		dispatch({ type: TokensPageActionType.SET_ERROR, data: null });
		try {
			await revokeTokenByValue(token.tokenId);
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
		if (!confirm(`Delete this ${token.tokenType} token? This cannot be undone.`)) return;
		const actionKey = `${token.tokenType}:${token.tokenId}:delete`;
		dispatch({ type: TokensPageActionType.SET_TOKEN_ACTION_KEY, data: actionKey });
		dispatch({ type: TokensPageActionType.SET_ERROR, data: null });
		try {
			await deleteTokenByValue(token.tokenId);
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
		if (!confirm("Run token cleanup now? This will delete expired access tokens, expired/revoked refresh tokens, and used/expired authorization codes.")) return;
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
	const filteredTokens =
		environmentFilter.trim().length > 0
			? tokens.filter((token) => token.environmentId === environmentFilter)
			: tokens;

	if (loading && tokens.length === 0) {
		return <FullPageSpinner />;
	}

	return (
		<main className="flex h-screen flex-col bg-background p-6 text-foreground">
			<div className="mb-6 flex shrink-0 items-center gap-2 text-xl font-semibold">
				<Fingerprint className="h-6 w-6" />
				Tokens
			</div>

			{error && (
				<p className="mb-4 shrink-0 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-200">{error}</p>
			)}

			<TokensToolbar
				environments={environments}
				environmentFilter={environmentFilter}
				onEnvironmentFilterChange={(value) =>
					dispatch({ type: TokensPageActionType.SET_ENVIRONMENT_FILTER, data: value })
				}
				cleanupRunning={cleanupRunning}
				cleanupMessage={cleanupMessage}
				onRunCleanup={handleRunCleanup}
			/>

			<TokensTable
				tokens={filteredTokens}
				envById={envById}
				actionInProgress={tokenActionKey != null}
				onRevoke={handleRevoke}
				onDelete={handleDelete}
			/>

			{filteredTokens.length === 0 && (
				<p className="mt-4 shrink-0 text-center text-sm text-muted-foreground">
					No tokens found for the selected filter.
				</p>
			)}
		</main>
	);
}
