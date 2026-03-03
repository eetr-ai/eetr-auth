"use client";

import { useEffect, useState } from "react";
import { Settings, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import {
	listEnvironments,
	createEnvironment,
	updateEnvironment,
	deleteEnvironment,
} from "@/app/actions/environment-actions";
import {
	listScopes,
	createScope,
	deleteScope,
} from "@/app/actions/scope-actions";
import type { Environment } from "@/lib/repositories/environment.repository";
import type { Scope } from "@/lib/repositories/scope.repository";

export default function SetupPage() {
	const [environments, setEnvironments] = useState<Environment[]>([]);
	const [scopes, setScopes] = useState<Scope[]>([]);
	const [loading, setLoading] = useState(true);
	const [envName, setEnvName] = useState("");
	const [scopeName, setScopeName] = useState("");
	const [editingEnvId, setEditingEnvId] = useState<string | null>(null);
	const [editingEnvName, setEditingEnvName] = useState("");
	const [envError, setEnvError] = useState<string | null>(null);
	const [scopeError, setScopeError] = useState<string | null>(null);

	const load = async () => {
		setLoading(true);
		try {
			const [envs, scopesList] = await Promise.all([
				listEnvironments(),
				listScopes(),
			]);
			setEnvironments(envs);
			setScopes(scopesList);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	const handleCreateEnv = async (e: React.FormEvent) => {
		e.preventDefault();
		setEnvError(null);
		const name = envName.trim();
		if (!name) return;
		try {
			await createEnvironment(name);
			setEnvName("");
			await load();
		} catch (err) {
			setEnvError(err instanceof Error ? err.message : "Failed to create environment");
		}
	};

	const handleUpdateEnv = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!editingEnvId) return;
		setEnvError(null);
		try {
			const result = await updateEnvironment(editingEnvId, editingEnvName.trim());
			if (result) {
				setEditingEnvId(null);
				setEditingEnvName("");
				await load();
			}
		} catch (err) {
			setEnvError(err instanceof Error ? err.message : "Failed to update environment");
		}
	};

	const handleDeleteEnv = async (id: string) => {
		setEnvError(null);
		try {
			const result = await deleteEnvironment(id);
			if (result.ok) {
				await load();
			} else {
				setEnvError(result.error ?? "Failed to delete");
			}
		} catch (err) {
			setEnvError(err instanceof Error ? err.message : "Failed to delete environment");
		}
	};

	const handleCreateScope = async (e: React.FormEvent) => {
		e.preventDefault();
		setScopeError(null);
		const name = scopeName.trim();
		if (!name) return;
		try {
			await createScope(name);
			setScopeName("");
			await load();
		} catch (err) {
			setScopeError(err instanceof Error ? err.message : "Failed to create scope");
		}
	};

	const handleDeleteScope = async (id: string) => {
		setScopeError(null);
		try {
			const result = await deleteScope(id);
			if (result.ok) {
				await load();
			} else {
				setScopeError(result.error ?? "Failed to delete");
			}
		} catch (err) {
			setScopeError(err instanceof Error ? err.message : "Failed to delete scope");
		}
	};

	if (loading) {
		return (
			<main className="flex min-h-screen items-center justify-center p-6">
				<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
			</main>
		);
	}

	return (
		<main className="min-h-screen p-6 bg-background text-foreground">
			<div className="flex items-center gap-2 text-xl font-semibold">
				<Settings className="h-6 w-6" />
				Setup
			</div>

			<div className="mt-8 grid gap-8 md:grid-cols-2">
				{/* Environments */}
				<section className="rounded-xl border border-brand-muted p-6">
					<h2 className="mb-4 text-lg font-medium">Environments</h2>
					{envError && (
						<p className="mb-3 rounded-xl bg-red-950/50 px-3 py-2 text-sm text-red-200">
							{envError}
						</p>
					)}
					<form onSubmit={handleCreateEnv} className="mb-4 flex gap-2">
						<input
							type="text"
							value={envName}
							onChange={(e) => setEnvName(e.target.value)}
							placeholder="Environment name"
							className="flex-1 rounded-xl border border-brand-muted bg-background px-3 py-2 text-foreground placeholder:text-foreground/50 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
						/>
						<button
							type="submit"
							className="flex items-center gap-1 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-muted"
						>
							<Plus className="h-4 w-4" />
							Add
						</button>
					</form>
					<ul className="space-y-2">
						{environments.map((env) => (
							<li
								key={env.id}
								className="flex items-center justify-between rounded-xl border border-brand-muted px-3 py-2"
							>
								{editingEnvId === env.id ? (
									<form onSubmit={handleUpdateEnv} className="flex flex-1 gap-2">
										<input
											type="text"
											value={editingEnvName}
											onChange={(e) => setEditingEnvName(e.target.value)}
											className="flex-1 rounded-xl border border-brand-muted bg-background px-2 py-1 text-sm focus:border-brand focus:outline-none"
											autoFocus
										/>
										<button
											type="submit"
											className="rounded-full border border-brand-muted px-2 py-1 text-sm hover:bg-brand-muted/30"
										>
											Save
										</button>
										<button
											type="button"
											onClick={() => {
												setEditingEnvId(null);
												setEditingEnvName("");
											}}
											className="rounded-full border border-brand-muted px-2 py-1 text-sm hover:bg-brand-muted/30"
										>
											Cancel
										</button>
									</form>
								) : (
									<>
										<span className="font-medium">{env.name}</span>
										<div className="flex gap-1">
											<button
												type="button"
												onClick={() => {
													setEditingEnvId(env.id);
													setEditingEnvName(env.name);
												}}
												className="rounded-full p-1.5 text-muted-foreground hover:bg-brand-muted/30 hover:text-foreground"
												aria-label="Edit"
											>
												<Pencil className="h-4 w-4" />
											</button>
											<button
												type="button"
												onClick={() => handleDeleteEnv(env.id)}
												className="rounded-full p-1.5 text-muted-foreground hover:bg-red-950/50 hover:text-red-200"
												aria-label="Delete"
											>
												<Trash2 className="h-4 w-4" />
											</button>
										</div>
									</>
								)}
							</li>
						))}
						{environments.length === 0 && (
							<li className="py-2 text-sm text-muted-foreground">
								No environments yet. Add one above.
							</li>
						)}
					</ul>
				</section>

				{/* Scopes */}
				<section className="rounded-xl border border-brand-muted p-6">
					<h2 className="mb-4 text-lg font-medium">Scopes</h2>
					{scopeError && (
						<p className="mb-3 rounded-xl bg-red-950/50 px-3 py-2 text-sm text-red-200">
							{scopeError}
						</p>
					)}
					<form onSubmit={handleCreateScope} className="mb-4 flex gap-2">
						<input
							type="text"
							value={scopeName}
							onChange={(e) => setScopeName(e.target.value)}
							placeholder="Scope name"
							className="flex-1 rounded-xl border border-brand-muted bg-background px-3 py-2 text-foreground placeholder:text-foreground/50 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
						/>
						<button
							type="submit"
							className="flex items-center gap-1 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-muted"
						>
							<Plus className="h-4 w-4" />
							Add
						</button>
					</form>
					<ul className="space-y-2">
						{scopes.map((scope) => (
							<li
								key={scope.id}
								className="flex items-center justify-between rounded-xl border border-brand-muted px-3 py-2"
							>
								<span className="font-medium">{scope.scopeName}</span>
								<button
									type="button"
									onClick={() => handleDeleteScope(scope.id)}
									className="rounded-full p-1.5 text-muted-foreground hover:bg-red-950/50 hover:text-red-200"
									aria-label="Delete"
								>
									<Trash2 className="h-4 w-4" />
								</button>
							</li>
						))}
						{scopes.length === 0 && (
							<li className="py-2 text-sm text-muted-foreground">
								No scopes yet. Add one above.
							</li>
						)}
					</ul>
				</section>
			</div>
		</main>
	);
}
