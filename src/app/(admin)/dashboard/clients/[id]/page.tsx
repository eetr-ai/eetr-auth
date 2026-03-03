"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";
import {
	getClientWithDetails,
	updateClientRedirectUris,
	updateClientScopes,
	deleteClient,
	rotateClientSecret,
} from "@/app/actions/client-actions";
import { listEnvironments } from "@/app/actions/environment-actions";
import { listScopes } from "@/app/actions/scope-actions";
import type { ClientWithDetails } from "@/lib/repositories/client.repository";
import type { Environment } from "@/lib/repositories/environment.repository";
import type { Scope } from "@/lib/repositories/scope.repository";

export default function ClientDetailPage() {
	const params = useParams();
	const router = useRouter();
	const id = params.id as string;
	const [client, setClient] = useState<ClientWithDetails | null>(null);
	const [environments, setEnvironments] = useState<Environment[]>([]);
	const [scopes, setScopes] = useState<Scope[]>([]);
	const [loading, setLoading] = useState(true);
	const [redirectUris, setRedirectUris] = useState<string[]>([]);
	const [scopeIds, setScopeIds] = useState<string[]>([]);
	const [savingUris, setSavingUris] = useState(false);
	const [savingScopes, setSavingScopes] = useState(false);
	const [rotating, setRotating] = useState(false);
	const [rotatedSecret, setRotatedSecret] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function load() {
			setLoading(true);
			setError(null);
			try {
				const [details, envs, scopesList] = await Promise.all([
					getClientWithDetails(id),
					listEnvironments(),
					listScopes(),
				]);
				if (details) {
					setClient(details);
					setRedirectUris(
						details.redirectUris.length > 0 ? details.redirectUris : [""]
					);
					setScopeIds(details.scopeIds);
				} else {
					setClient(null);
				}
				setEnvironments(envs);
				setScopes(scopesList);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to load client");
			} finally {
				setLoading(false);
			}
		}
		load();
	}, [id]);

	const envById = Object.fromEntries(environments.map((e) => [e.id, e]));
	const scopeById = Object.fromEntries(scopes.map((s) => [s.id, s]));

	const handleSaveUris = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!client) return;
		setSavingUris(true);
		setError(null);
		try {
			const uris = redirectUris.filter((u) => u?.trim());
			const updated = await updateClientRedirectUris(id, uris);
			if (updated) {
				setClient(updated);
				setRedirectUris(uris.length > 0 ? uris : [""]);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to update redirect URIs");
		} finally {
			setSavingUris(false);
		}
	};

	const handleSaveScopes = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!client) return;
		setSavingScopes(true);
		setError(null);
		try {
			const updated = await updateClientScopes(id, scopeIds);
			if (updated) {
				setClient(updated);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to update scopes");
		} finally {
			setSavingScopes(false);
		}
	};

	const handleRotateSecret = async () => {
		if (!confirm("Generate a new client secret? The current secret will stop working. The new secret will be shown only once."))
			return;
		setRotating(true);
		setError(null);
		setRotatedSecret(null);
		try {
			const result = await rotateClientSecret(id);
			if (result) {
				setRotatedSecret(result.clientSecret);
				setClient((prev) => (prev ? { ...prev, clientSecret: result.clientSecret } : null));
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to rotate secret");
		} finally {
			setRotating(false);
		}
	};

	const handleDelete = async () => {
		if (!confirm("Delete this client? This cannot be undone.")) return;
		try {
			await deleteClient(id);
			router.push("/dashboard/clients");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to delete client");
		}
	};

	const addUri = () => setRedirectUris((prev) => [...prev, ""]);
	const setUriAt = (i: number, v: string) => {
		setRedirectUris((prev) => {
			const next = [...prev];
			next[i] = v;
			return next;
		});
	};
	const removeUri = (i: number) => {
		setRedirectUris((prev) => prev.filter((_, j) => j !== i));
	};

	const toggleScope = (scopeId: string) => {
		setScopeIds((prev) =>
			prev.includes(scopeId) ? prev.filter((s) => s !== scopeId) : [...prev, scopeId]
		);
	};

	const copySecret = async () => {
		if (!rotatedSecret) return;
		await navigator.clipboard.writeText(rotatedSecret);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
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
						onClick={() => setRotatedSecret(null)}
						className="mt-2 text-sm text-muted-foreground underline hover:text-foreground"
					>
						Dismiss
					</button>
				</div>
			)}

			<div className="space-y-6">
				<section className="rounded-xl border border-brand-muted p-6">
					<h2 className="mb-3 text-lg font-medium">Client ID</h2>
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
			</div>
		</main>
	);
}
