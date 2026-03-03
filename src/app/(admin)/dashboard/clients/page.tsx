"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound, Plus, Trash2, Loader2, Eye, Copy, Check } from "lucide-react";
import {
	listClients,
	createClient,
	deleteClient,
} from "@/app/actions/client-actions";
import { listEnvironments } from "@/app/actions/environment-actions";
import { listScopes } from "@/app/actions/scope-actions";
import type { Environment } from "@/lib/repositories/environment.repository";
import type { Scope } from "@/lib/repositories/scope.repository";
import type { Client } from "@/lib/repositories/client.repository";

function DeleteClientButton({
	clientId,
	clientDisplayId,
	onDeleted,
}: {
	clientId: string;
	clientDisplayId: string;
	onDeleted: () => void;
}) {
	const [deleting, setDeleting] = useState(false);
	const handleDelete = async () => {
		if (!confirm(`Delete client ${clientDisplayId}? This cannot be undone.`)) return;
		setDeleting(true);
		try {
			await deleteClient(clientId);
			onDeleted();
		} finally {
			setDeleting(false);
		}
	};
	return (
		<button
			type="button"
			onClick={handleDelete}
			disabled={deleting}
			className="flex items-center gap-1 rounded-full border border-brand-muted px-2 py-1 text-xs text-red-200 hover:bg-red-950/50 disabled:opacity-50"
		>
			<Trash2 className="h-3 w-3" />
			Delete
		</button>
	);
}

export default function ClientsPage() {
	const [clients, setClients] = useState<Client[]>([]);
	const [environments, setEnvironments] = useState<Environment[]>([]);
	const [scopes, setScopes] = useState<Scope[]>([]);
	const [loading, setLoading] = useState(true);
	const [envFilter, setEnvFilter] = useState<string>("");
	const [showCreate, setShowCreate] = useState(false);
	const [createEnvId, setCreateEnvId] = useState("");
	const [redirectUris, setRedirectUris] = useState<string[]>([""]);
	const [selectedScopeIds, setSelectedScopeIds] = useState<string[]>([]);
	const [expiresAt, setExpiresAt] = useState("");
	const [creating, setCreating] = useState(false);
	const [createError, setCreateError] = useState<string | null>(null);
	const [createdSecret, setCreatedSecret] = useState<{
		clientId: string;
		clientSecret: string;
	} | null>(null);
	const [copied, setCopied] = useState<"id" | "secret" | null>(null);

	const load = async () => {
		setLoading(true);
		try {
			const [clientsList, envs, scopesList] = await Promise.all([
				listClients(envFilter || undefined),
				listEnvironments(),
				listScopes(),
			]);
			setClients(clientsList);
			setEnvironments(envs);
			setScopes(scopesList);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, [envFilter]);

	const envById = Object.fromEntries(environments.map((e) => [e.id, e]));

	const handleCreate = async (e: React.FormEvent) => {
		e.preventDefault();
		setCreateError(null);
		if (!createEnvId.trim()) {
			setCreateError("Select an environment");
			return;
		}
		setCreating(true);
		try {
			const result = await createClient({
				environmentId: createEnvId,
				redirectUris: redirectUris.filter((u) => u?.trim()),
				scopeIds: selectedScopeIds.length > 0 ? selectedScopeIds : undefined,
				expiresAt: expiresAt.trim() || undefined,
			});
			setCreatedSecret({
				clientId: result.client.clientId,
				clientSecret: result.clientSecret,
			});
			setShowCreate(false);
			setCreateEnvId("");
			setRedirectUris([""]);
			setSelectedScopeIds([]);
			setExpiresAt("");
			await load();
		} catch (err) {
			setCreateError(err instanceof Error ? err.message : "Failed to create client");
		} finally {
			setCreating(false);
		}
	};

	const copyToClipboard = async (text: string, which: "id" | "secret") => {
		await navigator.clipboard.writeText(text);
		setCopied(which);
		setTimeout(() => setCopied(null), 2000);
	};

	const addRedirectUri = () => setRedirectUris((prev) => [...prev, ""]);
	const setRedirectUriAt = (i: number, v: string) => {
		setRedirectUris((prev) => {
			const next = [...prev];
			next[i] = v;
			return next;
		});
	};
	const removeRedirectUri = (i: number) => {
		setRedirectUris((prev) => prev.filter((_, j) => j !== i));
	};

	const toggleScope = (scopeId: string) => {
		setSelectedScopeIds((prev) =>
			prev.includes(scopeId) ? prev.filter((id) => id !== scopeId) : [...prev, scopeId]
		);
	};

	if (loading && clients.length === 0) {
		return (
			<main className="flex min-h-screen items-center justify-center p-6">
				<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
			</main>
		);
	}

	return (
		<main className="min-h-screen p-6 bg-background text-foreground">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2 text-xl font-semibold">
					<KeyRound className="h-6 w-6" />
					Clients
				</div>
				<button
					type="button"
					onClick={() => setShowCreate((v) => !v)}
					className="flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-muted"
				>
					<Plus className="h-4 w-4" />
					Create client
				</button>
			</div>

			{createdSecret && (
				<div className="mt-6 rounded-xl border border-amber-600/50 bg-amber-950/30 p-4">
					<p className="mb-2 text-sm font-medium text-amber-200">
						Client created. Copy the credentials now — the secret will not be shown again.
					</p>
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<code className="flex-1 rounded border border-brand-muted bg-background px-2 py-1 text-sm">
								{createdSecret.clientId}
							</code>
							<button
								type="button"
								onClick={() => copyToClipboard(createdSecret.clientId, "id")}
								className="rounded-full p-1.5 hover:bg-brand-muted/30"
								aria-label="Copy client ID"
							>
								{copied === "id" ? (
									<Check className="h-4 w-4 text-green-400" />
								) : (
									<Copy className="h-4 w-4" />
								)}
							</button>
						</div>
						<div className="flex items-center gap-2">
							<code className="flex-1 rounded border border-brand-muted bg-background px-2 py-1 text-sm">
								{createdSecret.clientSecret}
							</code>
							<button
								type="button"
								onClick={() => copyToClipboard(createdSecret.clientSecret, "secret")}
								className="rounded-full p-1.5 hover:bg-brand-muted/30"
								aria-label="Copy secret"
							>
								{copied === "secret" ? (
									<Check className="h-4 w-4 text-green-400" />
								) : (
									<Copy className="h-4 w-4" />
								)}
							</button>
						</div>
					</div>
					<button
						type="button"
						onClick={() => setCreatedSecret(null)}
						className="mt-3 text-sm text-muted-foreground underline hover:text-foreground"
					>
						Dismiss
					</button>
				</div>
			)}

			{showCreate && (
				<div className="mt-6 rounded-xl border border-brand-muted p-6">
					<h2 className="mb-4 text-lg font-medium">New client</h2>
					{createError && (
						<p className="mb-3 rounded-xl bg-red-950/50 px-3 py-2 text-sm text-red-200">
							{createError}
						</p>
					)}
					<form onSubmit={handleCreate} className="space-y-4">
						<div>
							<label className="mb-1 block text-sm font-medium">Environment</label>
							<select
								value={createEnvId}
								onChange={(e) => setCreateEnvId(e.target.value)}
								required
								className="w-full rounded-xl border border-brand-muted bg-background px-3 py-2 text-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
							>
								<option value="">Select environment</option>
								{environments.map((e) => (
									<option key={e.id} value={e.id}>
										{e.name}
									</option>
								))}
							</select>
						</div>
						<div>
							<label className="mb-1 block text-sm font-medium">Redirect URIs (optional)</label>
							{redirectUris.map((uri, i) => (
								<div key={i} className="mb-2 flex gap-2">
									<input
										type="url"
										value={uri}
										onChange={(e) => setRedirectUriAt(i, e.target.value)}
										placeholder="https://..."
										className="flex-1 rounded-xl border border-brand-muted bg-background px-3 py-2 text-foreground placeholder:text-foreground/50 focus:border-brand focus:outline-none"
									/>
									<button
										type="button"
										onClick={() => removeRedirectUri(i)}
										className="rounded-full p-2 text-muted-foreground hover:bg-red-950/50 hover:text-red-200"
										aria-label="Remove"
									>
										<Trash2 className="h-4 w-4" />
									</button>
								</div>
							))}
							<button
								type="button"
								onClick={addRedirectUri}
								className="text-sm text-brand hover:underline"
							>
								+ Add URI
							</button>
						</div>
						<div>
							<label className="mb-1 block text-sm font-medium">Scopes (optional)</label>
							<div className="flex flex-wrap gap-2">
								{scopes.map((s) => (
									<label key={s.id} className="flex cursor-pointer items-center gap-2">
										<input
											type="checkbox"
											checked={selectedScopeIds.includes(s.id)}
											onChange={() => toggleScope(s.id)}
											className="rounded border-brand-muted"
										/>
										<span className="text-sm">{s.scopeName}</span>
									</label>
								))}
								{scopes.length === 0 && (
									<span className="text-sm text-muted-foreground">No scopes defined. Add them in Setup.</span>
								)}
							</div>
						</div>
						<div>
							<label className="mb-1 block text-sm font-medium">Expires at (optional)</label>
							<input
								type="datetime-local"
								value={expiresAt}
								onChange={(e) => setExpiresAt(e.target.value)}
								className="w-full rounded-xl border border-brand-muted bg-background px-3 py-2 text-foreground focus:border-brand focus:outline-none"
							/>
						</div>
						<div className="flex gap-2">
							<button
								type="submit"
								disabled={creating}
								className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-muted disabled:opacity-50"
							>
								{creating ? "Creating…" : "Create"}
							</button>
							<button
								type="button"
								onClick={() => setShowCreate(false)}
								className="rounded-full border border-brand-muted px-4 py-2 text-sm font-medium hover:bg-brand-muted/30"
							>
								Cancel
							</button>
						</div>
					</form>
				</div>
			)}

			<div className="mt-6">
				<div className="mb-2 flex items-center gap-2">
					<label className="text-sm font-medium">Filter by environment</label>
					<select
						value={envFilter}
						onChange={(e) => setEnvFilter(e.target.value)}
						className="rounded-xl border border-brand-muted bg-background px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
					>
						<option value="">All</option>
						{environments.map((e) => (
							<option key={e.id} value={e.id}>
								{e.name}
							</option>
						))}
					</select>
				</div>
				<div className="overflow-x-auto rounded-xl border border-brand-muted">
					<table className="w-full min-w-[500px] text-left text-sm">
						<thead>
							<tr className="border-b border-brand-muted bg-brand-muted/20">
								<th className="px-4 py-3 font-medium">Client ID</th>
								<th className="px-4 py-3 font-medium">Environment</th>
								<th className="px-4 py-3 font-medium">Created by</th>
								<th className="px-4 py-3 font-medium">Actions</th>
							</tr>
						</thead>
						<tbody>
							{clients.map((c) => (
								<tr key={c.id} className="border-b border-brand-muted/50">
									<td className="px-4 py-3 font-mono text-xs">{c.clientId}</td>
									<td className="px-4 py-3">{envById[c.environmentId]?.name ?? c.environmentId}</td>
									<td className="px-4 py-3 text-muted-foreground">{c.createdBy}</td>
									<td className="px-4 py-3">
										<div className="flex gap-2">
											<Link
												href={`/dashboard/clients/${c.id}`}
												className="flex items-center gap-1 rounded-full border border-brand-muted px-2 py-1 text-xs hover:bg-brand-muted/30"
											>
												<Eye className="h-3 w-3" />
												View
											</Link>
											<DeleteClientButton clientId={c.id} clientDisplayId={c.clientId} onDeleted={load} />
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				{clients.length === 0 && (
					<p className="mt-4 text-center text-sm text-muted-foreground">
						No clients yet. Create one above or add environments and scopes in Setup first.
					</p>
				)}
			</div>
		</main>
	);
}
