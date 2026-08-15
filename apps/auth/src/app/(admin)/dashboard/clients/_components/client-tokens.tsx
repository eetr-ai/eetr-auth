import { useCallback, useEffect, useRef, useState } from "react";
import { ListTodo } from "lucide-react";
import { Banner, EmptyState, Spinner } from "@/components/ui";
import {
	deleteTokenByValue,
	listTokenActivityByClient,
	revokeTokenByValue,
} from "@/app/actions/token-actions";
import type { TokenAction } from "@/components/tokens/token-row";
import { TokensTable, tokenKey } from "@/components/tokens/tokens-table";
import type { TokenActivityItem } from "@/components/tokens/types";
import type { Environment } from "@/lib/repositories/environment.repository";

interface ClientTokensProps {
	/** Client row id. Null while creating, when there is nothing to list yet. */
	clientId: string | null;
	/** OAuth client_id, for the link through to the filtered activity page. */
	oauthClientId: string | null;
	environments: Environment[];
}

/**
 * The client's issued tokens, inside the edit panel.
 *
 * Renders the same `TokensTable` as /dashboard/tokens rather than a bespoke
 * list, so the two never drift — only the client column is suppressed, since
 * every row here is the same client.
 */
export function ClientTokens({ clientId, oauthClientId, environments }: ClientTokensProps) {
	const [tokens, setTokens] = useState<TokenActivityItem[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [confirming, setConfirming] = useState<{ key: string; action: TokenAction } | null>(null);
	const [busyKey, setBusyKey] = useState<string | null>(null);

	const envById = Object.fromEntries(environments.map((env) => [env.id, env]));

	// `clientId` is read through a ref inside the guard so a refresh started for
	// one client cannot land after the panel has switched to another.
	const activeClientId = useRef(clientId);
	activeClientId.current = clientId;

	const reload = useCallback(async (id: string) => {
		const items = await listTokenActivityByClient(id);
		if (activeClientId.current === id) setTokens(items);
	}, []);

	useEffect(() => {
		if (!clientId) return;
		let cancelled = false;
		setTokens(null);
		setError(null);
		setConfirming(null);
		listTokenActivityByClient(clientId)
			.then((items) => {
				// The panel can be closed and reopened on another client before this
				// resolves; without the guard the previous client's tokens would land.
				if (!cancelled) setTokens(items);
			})
			.catch((err: unknown) => {
				if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load tokens");
			});
		return () => {
			cancelled = true;
		};
	}, [clientId]);

	const runAction = async (token: TokenActivityItem, action: TokenAction) => {
		if (!clientId) return;
		setError(null);
		setBusyKey(tokenKey(token));
		try {
			if (action === "revoke") await revokeTokenByValue(token.tokenId);
			else await deleteTokenByValue(token.tokenId);
			setConfirming(null);
			await reload(clientId);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : `Failed to ${action} token`,
			);
		} finally {
			setBusyKey(null);
		}
	};

	if (!clientId) return null;

	return (
		<section className="mt-8 border-t border-border pt-6">
			<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
				<h3 className="flex items-center gap-2 text-sm font-medium">
					<ListTodo className="h-4 w-4" />
					Issued tokens
					{tokens ? (
						<span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs text-muted-foreground">
							{tokens.length}
						</span>
					) : null}
				</h3>
				{oauthClientId ? (
					<a
						href={`/dashboard/tokens?client=${encodeURIComponent(oauthClientId)}`}
						className="text-xs text-muted-foreground underline hover:text-foreground"
					>
						Open in Tokens
					</a>
				) : null}
			</div>

			<Banner variant="error" message={error} />

			{tokens === null ? (
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Spinner />
					Loading tokens…
				</div>
			) : tokens.length === 0 ? (
				<EmptyState
					icon={ListTodo}
					title="No tokens issued yet"
					description="Tokens appear here once this client completes an authorization flow."
				/>
			) : (
				<TokensTable
					tokens={tokens}
					envById={envById}
					actionInProgress={busyKey != null}
					confirming={confirming}
					busyKey={busyKey}
					onRequestAction={(token, action) =>
						setConfirming({ key: tokenKey(token), action })
					}
					onConfirmAction={runAction}
					onCancelAction={() => setConfirming(null)}
					hideClient
					// Without the client column the table fits the panel without scrolling.
					minWidth="min-w-0"
				/>
			)}
		</section>
	);
}
