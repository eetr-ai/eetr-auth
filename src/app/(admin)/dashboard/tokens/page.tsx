"use client";

import { useEffect, useState } from "react";
import { Loader2, Fingerprint, Ban, Trash2 } from "lucide-react";
import {
	listTokenActivity,
	revokeTokenByValue,
	deleteTokenByValue,
} from "@/app/actions/token-actions";
import { listEnvironments } from "@/app/actions/environment-actions";
import type { Environment } from "@/lib/repositories/environment.repository";

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

function maskToken(token: string): string {
	if (token.length <= 12) return token;
	return `${token.slice(0, 8)}...${token.slice(-4)}`;
}

export default function TokensPage() {
	const [tokens, setTokens] = useState<TokenActivityItem[]>([]);
	const [environments, setEnvironments] = useState<Environment[]>([]);
	const [loading, setLoading] = useState(true);
	const [environmentFilter, setEnvironmentFilter] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [tokenActionKey, setTokenActionKey] = useState<string | null>(null);

	useEffect(() => {
		async function load() {
			setLoading(true);
			setError(null);
			try {
				const [tokenItems, envs] = await Promise.all([
					listTokenActivity(),
					listEnvironments(),
				]);
				setTokens(tokenItems);
				setEnvironments(envs);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to load tokens");
			} finally {
				setLoading(false);
			}
		}
		load();
	}, []);

	const reloadTokens = async () => {
		const tokenItems = await listTokenActivity();
		setTokens(tokenItems);
	};

	const handleRevoke = async (token: TokenActivityItem) => {
		if (!confirm(`Revoke this ${token.tokenType} token?`)) return;
		const actionKey = `${token.tokenType}:${token.tokenId}:revoke`;
		setTokenActionKey(actionKey);
		setError(null);
		try {
			await revokeTokenByValue(token.tokenId);
			await reloadTokens();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to revoke token");
		} finally {
			setTokenActionKey(null);
		}
	};

	const handleDelete = async (token: TokenActivityItem) => {
		if (!confirm(`Delete this ${token.tokenType} token? This cannot be undone.`)) return;
		const actionKey = `${token.tokenType}:${token.tokenId}:delete`;
		setTokenActionKey(actionKey);
		setError(null);
		try {
			await deleteTokenByValue(token.tokenId);
			await reloadTokens();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to delete token");
		} finally {
			setTokenActionKey(null);
		}
	};

	const envById = Object.fromEntries(environments.map((environment) => [environment.id, environment]));
	const filteredTokens =
		environmentFilter.trim().length > 0
			? tokens.filter((token) => token.environmentId === environmentFilter)
			: tokens;

	if (loading && tokens.length === 0) {
		return (
			<main className="flex min-h-screen items-center justify-center p-6">
				<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
			</main>
		);
	}

	return (
		<main className="min-h-screen bg-background p-6 text-foreground">
			<div className="mb-6 flex items-center gap-2 text-xl font-semibold">
				<Fingerprint className="h-6 w-6" />
				Tokens
			</div>

			{error && (
				<p className="mb-4 rounded-xl bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</p>
			)}

			<div className="mb-4 flex items-center gap-2">
				<label className="text-sm font-medium">Filter by environment</label>
				<select
					value={environmentFilter}
					onChange={(event) => setEnvironmentFilter(event.target.value)}
					className="rounded-xl border border-brand-muted bg-background px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
				>
					<option value="">All</option>
					{environments.map((environment) => (
						<option key={environment.id} value={environment.id}>
							{environment.name}
						</option>
					))}
				</select>
			</div>

			<div className="overflow-x-auto rounded-xl border border-brand-muted">
				<table className="w-full min-w-[900px] text-left text-sm">
					<thead>
						<tr className="border-b border-brand-muted bg-brand-muted/20">
							<th className="px-4 py-3 font-medium">Type</th>
							<th className="px-4 py-3 font-medium">Token</th>
							<th className="px-4 py-3 font-medium">Client</th>
							<th className="px-4 py-3 font-medium">Environment</th>
							<th className="px-4 py-3 font-medium">Scopes</th>
							<th className="px-4 py-3 font-medium">Status</th>
							<th className="px-4 py-3 font-medium">Created</th>
							<th className="px-4 py-3 font-medium">Expires</th>
							<th className="px-4 py-3 font-medium">Rotated From</th>
							<th className="px-4 py-3 font-medium">Actions</th>
						</tr>
					</thead>
					<tbody>
						{filteredTokens.map((token) => (
							<tr key={`${token.tokenType}-${token.tokenId}`} className="border-b border-brand-muted/50">
								<td className="px-4 py-3 uppercase">{token.tokenType}</td>
								<td className="px-4 py-3 font-mono text-xs">{maskToken(token.tokenId)}</td>
								<td className="px-4 py-3 font-mono text-xs">{token.clientId}</td>
								<td className="px-4 py-3">
									{envById[token.environmentId]?.name ?? token.environmentId}
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
								<td className="px-4 py-3">{new Date(token.expiresAt).toLocaleString()}</td>
								<td className="px-4 py-3 font-mono text-xs">
									{token.rotatedFromTokenId ? maskToken(token.rotatedFromTokenId) : "n/a"}
								</td>
								<td className="px-4 py-3">
									<div className="flex items-center gap-2">
										<button
											type="button"
											onClick={() => handleRevoke(token)}
											disabled={tokenActionKey != null}
											className="inline-flex items-center gap-1 rounded-full border border-amber-700 px-2 py-1 text-xs text-amber-200 hover:bg-amber-950/50 disabled:opacity-50"
										>
											<Ban className="h-3.5 w-3.5" />
											Revoke
										</button>
										<button
											type="button"
											onClick={() => handleDelete(token)}
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

			{filteredTokens.length === 0 && (
				<p className="mt-4 text-center text-sm text-muted-foreground">
					No tokens found for the selected filter.
				</p>
			)}
		</main>
	);
}
