import { useState, type FormEvent } from "react";
import type { ReducerAction } from "@eetr/react-reducer-utils";
import { Layers, Pencil, Plus, Trash2 } from "lucide-react";
import {
	Banner,
	Button,
	EmptyState,
	IconButton,
	InlineDeleteConfirm,
	Input,
	SectionCard,
} from "@/components/ui";
import { environmentLabel, type Environment } from "@/lib/repositories/environment.repository";
import { SetupPageActionType } from "./state";

interface EnvironmentsSectionProps {
	environments: Environment[];
	envName: string;
	envDisplayName: string;
	editingEnvId: string | null;
	editingEnvName: string;
	editingEnvDisplayName: string;
	envError: string | null;
	dispatch: (action: ReducerAction<SetupPageActionType>) => void;
	onCreate: (e: FormEvent) => void;
	onUpdate: (e: FormEvent) => void;
	onDelete: (id: string) => void;
	/** A mutation is in flight; disable the controls so it cannot be double-submitted. */
	saving: boolean;
}

/**
 * Environments keep a compact inline add-row and inline edit rather than a side
 * panel — an overlay to capture two short text inputs would cost more screen
 * than it saves.
 *
 * `name` is the identifier (JWT claim, token validation, activity log) and the
 * display name is only a label, so the row shows the label with the identifier
 * beneath it whenever the two differ.
 */
export function EnvironmentsSection({
	environments,
	envName,
	envDisplayName,
	editingEnvId,
	editingEnvName,
	editingEnvDisplayName,
	envError,
	dispatch,
	onCreate,
	onUpdate,
	onDelete,
	saving,
}: EnvironmentsSectionProps) {
	// Purely ephemeral UI state, so it stays local rather than in the page reducer.
	const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

	return (
		<SectionCard title="Environments" icon={Layers}>
			<Banner variant="error" message={envError} />
			<form onSubmit={onCreate} className="mb-4 flex flex-col gap-2">
				<div className="flex gap-2">
					<Input
						type="text"
						value={envName}
						onChange={(e) =>
							dispatch({ type: SetupPageActionType.SET_ENV_NAME, data: e.target.value })
						}
						placeholder="Environment name"
						className="flex-1"
					/>
					<Button type="submit" icon={Plus} loading={saving}>
						Add
					</Button>
				</div>
				<Input
					type="text"
					value={envDisplayName}
					onChange={(e) =>
						dispatch({ type: SetupPageActionType.SET_ENV_DISPLAY_NAME, data: e.target.value })
					}
					placeholder="Display name (optional)"
				/>
			</form>

			{environments.length === 0 ? (
				<EmptyState
					icon={Layers}
					title="No environments yet"
					description="Environments group clients and scope password policies to a deployment."
				/>
			) : (
				<ul className="divide-y divide-border overflow-hidden rounded-card border border-border">
					{environments.map((env) => (
						<li key={env.id} className="flex items-center justify-between gap-2 px-3 py-2">
							{editingEnvId === env.id ? (
								<form onSubmit={onUpdate} className="flex flex-1 flex-col gap-2">
									<Input
										type="text"
										value={editingEnvName}
										onChange={(e) =>
											dispatch({
												type: SetupPageActionType.SET_EDITING_ENV_NAME,
												data: e.target.value,
											})
										}
										className="px-2 py-1 text-sm"
										autoFocus
									/>
									<Input
										type="text"
										value={editingEnvDisplayName}
										onChange={(e) =>
											dispatch({
												type: SetupPageActionType.SET_EDITING_ENV_DISPLAY_NAME,
												data: e.target.value,
											})
										}
										placeholder="Display name (optional)"
										className="px-2 py-1 text-sm"
									/>
									<div className="flex gap-2">
										<button
											type="submit"
											disabled={saving}
											className="rounded-full border border-border px-2 py-1 text-sm hover:bg-surface-hover disabled:opacity-50"
										>
											Save
										</button>
										<button
											type="button"
											onClick={() => {
												dispatch({ type: SetupPageActionType.SET_EDITING_ENV_ID, data: null });
												dispatch({ type: SetupPageActionType.SET_EDITING_ENV_NAME, data: "" });
												dispatch({
													type: SetupPageActionType.SET_EDITING_ENV_DISPLAY_NAME,
													data: "",
												});
											}}
											className="rounded-full border border-border px-2 py-1 text-sm hover:bg-surface-hover"
										>
											Cancel
										</button>
									</div>
								</form>
							) : (
								<>
									<div className="min-w-0">
										<span className="block truncate font-medium">{environmentLabel(env)}</span>
										{env.displayName?.trim() && (
											<span className="block truncate font-mono text-xs text-muted-foreground">
												{env.name}
											</span>
										)}
									</div>
									{confirmingDeleteId === env.id ? (
										<InlineDeleteConfirm
											label={`Delete "${environmentLabel(env)}"?`}
											busy={saving}
											onConfirm={() => {
												onDelete(env.id);
												setConfirmingDeleteId(null);
											}}
											onCancel={() => setConfirmingDeleteId(null)}
										/>
									) : (
										<div className="flex shrink-0 gap-1">
											<IconButton
												type="button"
												aria-label={`Edit ${environmentLabel(env)}`}
												title="Edit"
												disabled={saving}
												onClick={() => {
													dispatch({ type: SetupPageActionType.SET_EDITING_ENV_ID, data: env.id });
													dispatch({
														type: SetupPageActionType.SET_EDITING_ENV_NAME,
														data: env.name,
													});
													dispatch({
														type: SetupPageActionType.SET_EDITING_ENV_DISPLAY_NAME,
														data: env.displayName ?? "",
													});
												}}
											>
												<Pencil className="h-4 w-4" />
											</IconButton>
											<IconButton
												type="button"
												variant="danger"
												aria-label={`Delete ${environmentLabel(env)}`}
												title="Delete"
												disabled={saving}
												onClick={() => setConfirmingDeleteId(env.id)}
											>
												<Trash2 className="h-4 w-4" />
											</IconButton>
										</div>
									)}
								</>
							)}
						</li>
					))}
				</ul>
			)}
		</SectionCard>
	);
}
