import { useState, type FormEvent } from "react";
import type { ReducerAction } from "@eetr/react-reducer-utils";
import { Pencil, Plus, Tag, Trash2 } from "lucide-react";
import {
	Banner,
	Button,
	EmptyState,
	IconButton,
	InlineDeleteConfirm,
	Input,
	SectionCard,
} from "@/components/ui";
import type { Scope } from "@/lib/repositories/scope.repository";
import { SetupPageActionType } from "./state";

interface ScopesSectionProps {
	scopes: Scope[];
	scopeName: string;
	scopeDisplayName: string;
	scopeDescription: string;
	editingScopeId: string | null;
	editingScopeDisplayName: string;
	editingScopeDescription: string;
	scopeError: string | null;
	dispatch: (action: ReducerAction<SetupPageActionType>) => void;
	onCreate: (e: FormEvent) => void;
	onUpdate: (e: FormEvent) => void;
	onDelete: (id: string) => void;
	/** A mutation is in flight; disable the controls so it cannot be double-submitted. */
	saving: boolean;
}

/**
 * Scopes keep the compact inline add-row rather than a side panel: the extra two
 * fields are optional consent copy, so the row stays a stack of plain inputs and
 * the section still reads as a list rather than a form surface.
 *
 * Only the copy is editable. `scopeName` is the protocol token clients send in
 * `scope`, so it is create-only — renaming it would break every client already
 * requesting it.
 */
export function ScopesSection({
	scopes,
	scopeName,
	scopeDisplayName,
	scopeDescription,
	editingScopeId,
	editingScopeDisplayName,
	editingScopeDescription,
	scopeError,
	dispatch,
	onCreate,
	onUpdate,
	onDelete,
	saving,
}: ScopesSectionProps) {
	// Purely ephemeral UI state, so it stays local rather than in the page reducer.
	const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

	return (
		<SectionCard title="Scopes" icon={Tag}>
			<Banner variant="error" message={scopeError} />
			<form onSubmit={onCreate} className="mb-4 flex flex-col gap-2">
				<div className="flex gap-2">
					<Input
						type="text"
						value={scopeName}
						onChange={(e) =>
							dispatch({
								type: SetupPageActionType.SET_SCOPE_NAME,
								data: e.target.value,
							})
						}
						placeholder="Scope name"
						className="flex-1"
					/>
					<Button type="submit" icon={Plus} loading={saving}>
						Add
					</Button>
				</div>
				<Input
					type="text"
					value={scopeDisplayName}
					onChange={(e) =>
						dispatch({
							type: SetupPageActionType.SET_SCOPE_DISPLAY_NAME,
							data: e.target.value,
						})
					}
					placeholder="Consent label (optional)"
				/>
				<Input
					type="text"
					value={scopeDescription}
					onChange={(e) =>
						dispatch({
							type: SetupPageActionType.SET_SCOPE_DESCRIPTION,
							data: e.target.value,
						})
					}
					placeholder="What the user is agreeing to (optional)"
				/>
			</form>
			{scopes.length === 0 ? (
				<EmptyState
					icon={Tag}
					title="No scopes yet"
					description="Scopes are the permissions a client can request during authorization."
				/>
			) : (
				<ul className="divide-y divide-border overflow-hidden rounded-card border border-border">
					{scopes.map((scope) => (
						<li key={scope.id} className="px-3 py-2">
							{editingScopeId === scope.id ? (
								<form onSubmit={onUpdate} className="flex flex-col gap-2">
									<span className="font-mono text-xs text-muted-foreground">
										{scope.scopeName}
									</span>
									<Input
										type="text"
										value={editingScopeDisplayName}
										onChange={(e) =>
											dispatch({
												type: SetupPageActionType.SET_EDITING_SCOPE_DISPLAY_NAME,
												data: e.target.value,
											})
										}
										placeholder="Consent label (optional)"
										className="px-2 py-1 text-sm"
										autoFocus
									/>
									<Input
										type="text"
										value={editingScopeDescription}
										onChange={(e) =>
											dispatch({
												type: SetupPageActionType.SET_EDITING_SCOPE_DESCRIPTION,
												data: e.target.value,
											})
										}
										placeholder="What the user is agreeing to (optional)"
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
											onClick={() =>
												dispatch({ type: SetupPageActionType.SET_EDITING_SCOPE_ID, data: null })
											}
											className="rounded-full border border-border px-2 py-1 text-sm hover:bg-surface-hover"
										>
											Cancel
										</button>
									</div>
								</form>
							) : (
								<div className="flex items-center justify-between gap-2">
									<div className="min-w-0">
										<span className="block truncate font-medium">
											{scope.displayName ?? scope.scopeName}
										</span>
										{scope.displayName && (
											<span className="block truncate font-mono text-xs text-muted-foreground">
												{scope.scopeName}
											</span>
										)}
										{scope.description && (
											<span className="block truncate text-sm text-muted-foreground">
												{scope.description}
											</span>
										)}
									</div>
									{confirmingDeleteId === scope.id ? (
										<InlineDeleteConfirm
											label={`Delete "${scope.scopeName}"?`}
											busy={saving}
											onConfirm={() => {
												onDelete(scope.id);
												setConfirmingDeleteId(null);
											}}
											onCancel={() => setConfirmingDeleteId(null)}
										/>
									) : (
										<div className="flex shrink-0 gap-1">
											<IconButton
												type="button"
												aria-label={`Edit ${scope.scopeName}`}
												title="Edit consent copy"
												disabled={saving}
												onClick={() => {
													dispatch({
														type: SetupPageActionType.SET_EDITING_SCOPE_ID,
														data: scope.id,
													});
													dispatch({
														type: SetupPageActionType.SET_EDITING_SCOPE_DISPLAY_NAME,
														data: scope.displayName ?? "",
													});
													dispatch({
														type: SetupPageActionType.SET_EDITING_SCOPE_DESCRIPTION,
														data: scope.description ?? "",
													});
												}}
											>
												<Pencil className="h-4 w-4" />
											</IconButton>
											<IconButton
												type="button"
												variant="danger"
												aria-label={`Delete ${scope.scopeName}`}
												title="Delete"
												disabled={saving}
												onClick={() => setConfirmingDeleteId(scope.id)}
											>
												<Trash2 className="h-4 w-4" />
											</IconButton>
										</div>
									)}
								</div>
							)}
						</li>
					))}
				</ul>
			)}
		</SectionCard>
	);
}
