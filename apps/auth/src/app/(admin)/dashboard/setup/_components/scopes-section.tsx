import { useState } from "react";
import { Pencil, Plus, Tag, Trash2 } from "lucide-react";
import {
	Banner,
	Button,
	EmptyState,
	IconButton,
	InlineDeleteConfirm,
	SectionCard,
} from "@/components/ui";
import type { Scope } from "@/lib/repositories/scope.repository";

interface ScopesSectionProps {
	scopes: Scope[];
	scopeError: string | null;
	onCreate: () => void;
	onEdit: (scope: Scope) => void;
	onDelete: (id: string) => void;
	/** A mutation is in flight; disable the controls so it cannot be double-submitted. */
	saving: boolean;
}

/**
 * Listing only: create and edit happen in a side panel, because a scope is a
 * multi-field entity (protocol token plus two fields of consent copy).
 *
 * Deleting stays a two-click inline confirm — deleting a record is never a dialog.
 */
export function ScopesSection({
	scopes,
	scopeError,
	onCreate,
	onEdit,
	onDelete,
	saving,
}: ScopesSectionProps) {
	// Purely ephemeral UI state, so it stays local rather than in the page reducer.
	const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

	return (
		<SectionCard
			title="Scopes"
			icon={Tag}
			action={
				<Button type="button" icon={Plus} onClick={onCreate} disabled={saving}>
					New scope
				</Button>
			}
		>
			<Banner variant="error" message={scopeError} />

			{scopes.length === 0 ? (
				<EmptyState
					icon={Tag}
					title="No scopes yet"
					description="Scopes are the permissions a client can request during authorization."
					action={
						<Button type="button" icon={Plus} onClick={onCreate}>
							New scope
						</Button>
					}
				/>
			) : (
				<ul className="divide-y divide-border overflow-hidden rounded-card border border-border">
					{scopes.map((scope) => (
						<li key={scope.id} className="flex items-center justify-between gap-2 px-3 py-2">
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
										title="Edit"
										disabled={saving}
										onClick={() => onEdit(scope)}
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
						</li>
					))}
				</ul>
			)}
		</SectionCard>
	);
}
