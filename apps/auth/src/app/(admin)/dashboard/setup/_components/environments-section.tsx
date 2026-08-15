import type { FormEvent } from "react";
import type { ReducerAction } from "@eetr/react-reducer-utils";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Banner, Button, IconButton, Input } from "@/components/ui";
import type { Environment } from "@/lib/repositories/environment.repository";
import { SetupPageActionType, type SetupTabId } from "./state";

interface EnvironmentsSectionProps {
	activeTab: SetupTabId;
	environments: Environment[];
	envName: string;
	editingEnvId: string | null;
	editingEnvName: string;
	envError: string | null;
	dispatch: (action: ReducerAction<SetupPageActionType>) => void;
	onCreate: (e: FormEvent) => void;
	onUpdate: (e: FormEvent) => void;
	onDelete: (id: string) => void;
}

export function EnvironmentsSection({
	activeTab,
	environments,
	envName,
	editingEnvId,
	editingEnvName,
	envError,
	dispatch,
	onCreate,
	onUpdate,
	onDelete,
}: EnvironmentsSectionProps) {
	return (
		<section
			className={`mt-6 rounded-card border border-border p-6 ${activeTab !== "environments" ? "hidden" : ""}`}
			role="tabpanel"
			id="setup-panel-environments"
			aria-labelledby="setup-tab-environments"
			aria-hidden={activeTab !== "environments"}
		>
			<h2 className="mb-4 text-lg font-medium">Environments</h2>
			<Banner variant="error" message={envError} />
			<form onSubmit={onCreate} className="mb-4 flex gap-2">
				<Input
					type="text"
					value={envName}
					onChange={(e) =>
						dispatch({ type: SetupPageActionType.SET_ENV_NAME, data: e.target.value })
					}
					placeholder="Environment name"
					className="flex-1"
				/>
				<Button type="submit" icon={Plus}>
					Add
				</Button>
			</form>
			<ul className="space-y-2">
				{environments.map((env) => (
					<li
						key={env.id}
						className="flex items-center justify-between rounded-card border border-border px-3 py-2"
					>
						{editingEnvId === env.id ? (
							<form onSubmit={onUpdate} className="flex flex-1 gap-2">
								<input
									type="text"
									value={editingEnvName}
									onChange={(e) =>
										dispatch({
											type: SetupPageActionType.SET_EDITING_ENV_NAME,
											data: e.target.value,
										})
									}
									className="flex-1 rounded-card border border-border bg-background px-2 py-1 text-sm focus:border-brand focus:outline-none"
									autoFocus
								/>
								<button
									type="submit"
									className="rounded-full border border-border px-2 py-1 text-sm hover:bg-surface-hover"
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
									className="rounded-full border border-border px-2 py-1 text-sm hover:bg-surface-hover"
								>
									Cancel
								</button>
							</form>
						) : (
							<>
								<span className="font-medium">{env.name}</span>
								<div className="flex gap-1">
									<IconButton
										type="button"
										aria-label="Edit"
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
									>
										<Pencil className="h-4 w-4" />
									</IconButton>
									<IconButton
										type="button"
										variant="danger"
										aria-label="Delete"
										onClick={() => onDelete(env.id)}
									>
										<Trash2 className="h-4 w-4" />
									</IconButton>
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
	);
}
