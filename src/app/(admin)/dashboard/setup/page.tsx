"use client";

import { ReducerAction, bootstrapProvider } from "@eetr/react-reducer-utils";
import { useEffect } from "react";
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

enum SetupPageActionType {
	SET_ENVIRONMENTS = "SET_ENVIRONMENTS",
	SET_SCOPES = "SET_SCOPES",
	SET_LOADING = "SET_LOADING",
	SET_ENV_NAME = "SET_ENV_NAME",
	SET_SCOPE_NAME = "SET_SCOPE_NAME",
	SET_EDITING_ENV_ID = "SET_EDITING_ENV_ID",
	SET_EDITING_ENV_NAME = "SET_EDITING_ENV_NAME",
	SET_ENV_ERROR = "SET_ENV_ERROR",
	SET_SCOPE_ERROR = "SET_SCOPE_ERROR",
}

interface SetupPageState {
	environments: Environment[];
	scopes: Scope[];
	loading: boolean;
	envName: string;
	scopeName: string;
	editingEnvId: string | null;
	editingEnvName: string;
	envError: string | null;
	scopeError: string | null;
}

const initialState: SetupPageState = {
	environments: [],
	scopes: [],
	loading: true,
	envName: "",
	scopeName: "",
	editingEnvId: null,
	editingEnvName: "",
	envError: null,
	scopeError: null,
};

function reducer(
	state: SetupPageState = initialState,
	action: ReducerAction<SetupPageActionType>
): SetupPageState {
	switch (action.type) {
		case SetupPageActionType.SET_ENVIRONMENTS:
			return { ...state, environments: (action.data as Environment[]) ?? [] };
		case SetupPageActionType.SET_SCOPES:
			return { ...state, scopes: (action.data as Scope[]) ?? [] };
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
		default:
			return state;
	}
}

const { Provider: SetupPageStateProvider, useContextAccessors: useSetupPageState } =
	bootstrapProvider<SetupPageState, ReducerAction<SetupPageActionType>>(
		reducer,
		initialState
	);

export default function SetupPage() {
	return (
		<SetupPageStateProvider>
			<SetupPageContent />
		</SetupPageStateProvider>
	);
}

function SetupPageContent() {
	const { state, dispatch } = useSetupPageState();
	const {
		environments,
		scopes,
		loading,
		envName,
		scopeName,
		editingEnvId,
		editingEnvName,
		envError,
		scopeError,
	} = state;

	const load = async () => {
		dispatch({ type: SetupPageActionType.SET_LOADING, data: true });
		try {
			const [envs, scopesList] = await Promise.all([
				listEnvironments(),
				listScopes(),
			]);
			dispatch({ type: SetupPageActionType.SET_ENVIRONMENTS, data: envs });
			dispatch({ type: SetupPageActionType.SET_SCOPES, data: scopesList });
		} finally {
			dispatch({ type: SetupPageActionType.SET_LOADING, data: false });
		}
	};

	useEffect(() => {
		load();
	}, [dispatch]);

	const handleCreateEnv = async (e: React.FormEvent) => {
		e.preventDefault();
		dispatch({ type: SetupPageActionType.SET_ENV_ERROR, data: null });
		const name = envName.trim();
		if (!name) return;
		try {
			await createEnvironment(name);
			dispatch({ type: SetupPageActionType.SET_ENV_NAME, data: "" });
			await load();
		} catch (err) {
			dispatch({
				type: SetupPageActionType.SET_ENV_ERROR,
				data: err instanceof Error ? err.message : "Failed to create environment",
			});
		}
	};

	const handleUpdateEnv = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!editingEnvId) return;
		dispatch({ type: SetupPageActionType.SET_ENV_ERROR, data: null });
		try {
			const result = await updateEnvironment(editingEnvId, editingEnvName.trim());
			if (result) {
				dispatch({ type: SetupPageActionType.SET_EDITING_ENV_ID, data: null });
				dispatch({ type: SetupPageActionType.SET_EDITING_ENV_NAME, data: "" });
				await load();
			}
		} catch (err) {
			dispatch({
				type: SetupPageActionType.SET_ENV_ERROR,
				data: err instanceof Error ? err.message : "Failed to update environment",
			});
		}
	};

	const handleDeleteEnv = async (id: string) => {
		dispatch({ type: SetupPageActionType.SET_ENV_ERROR, data: null });
		try {
			const result = await deleteEnvironment(id);
			if (result.ok) {
				await load();
			} else {
				dispatch({
					type: SetupPageActionType.SET_ENV_ERROR,
					data: result.error ?? "Failed to delete",
				});
			}
		} catch (err) {
			dispatch({
				type: SetupPageActionType.SET_ENV_ERROR,
				data: err instanceof Error ? err.message : "Failed to delete environment",
			});
		}
	};

	const handleCreateScope = async (e: React.FormEvent) => {
		e.preventDefault();
		dispatch({ type: SetupPageActionType.SET_SCOPE_ERROR, data: null });
		const name = scopeName.trim();
		if (!name) return;
		try {
			await createScope(name);
			dispatch({ type: SetupPageActionType.SET_SCOPE_NAME, data: "" });
			await load();
		} catch (err) {
			dispatch({
				type: SetupPageActionType.SET_SCOPE_ERROR,
				data: err instanceof Error ? err.message : "Failed to create scope",
			});
		}
	};

	const handleDeleteScope = async (id: string) => {
		dispatch({ type: SetupPageActionType.SET_SCOPE_ERROR, data: null });
		try {
			const result = await deleteScope(id);
			if (result.ok) {
				await load();
			} else {
				dispatch({
					type: SetupPageActionType.SET_SCOPE_ERROR,
					data: result.error ?? "Failed to delete",
				});
			}
		} catch (err) {
			dispatch({
				type: SetupPageActionType.SET_SCOPE_ERROR,
				data: err instanceof Error ? err.message : "Failed to delete scope",
			});
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
							onChange={(e) =>
								dispatch({ type: SetupPageActionType.SET_ENV_NAME, data: e.target.value })
							}
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
											onChange={(e) =>
												dispatch({
													type: SetupPageActionType.SET_EDITING_ENV_NAME,
													data: e.target.value,
												})
											}
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
												dispatch({
													type: SetupPageActionType.SET_EDITING_ENV_ID,
													data: null,
												});
												dispatch({
													type: SetupPageActionType.SET_EDITING_ENV_NAME,
													data: "",
												});
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
													dispatch({
														type: SetupPageActionType.SET_EDITING_ENV_ID,
														data: env.id,
													});
													dispatch({
														type: SetupPageActionType.SET_EDITING_ENV_NAME,
														data: env.name,
													});
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
							onChange={(e) =>
								dispatch({
									type: SetupPageActionType.SET_SCOPE_NAME,
									data: e.target.value,
								})
							}
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
