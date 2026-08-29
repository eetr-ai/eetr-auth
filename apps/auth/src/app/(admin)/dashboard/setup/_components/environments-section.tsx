import { useState } from "react";
import { Layers, Pencil, Plus, Trash2 } from "lucide-react";
import {
	Banner,
	Button,
	EmptyState,
	IconButton,
	InlineDeleteConfirm,
	SectionCard,
} from "@/components/ui";
import { environmentLabel, type Environment } from "@/lib/repositories/environment.repository";

interface EnvironmentsSectionProps {
	environments: Environment[];
	envError: string | null;
	onCreate: () => void;
	onEdit: (env: Environment) => void;
	onDelete: (id: string) => void;
	/** A mutation is in flight; disable the controls so it cannot be double-submitted. */
	saving: boolean;
}

/**
 * Listing only: create and edit happen in a side panel, because an environment is a
 * multi-field entity (identifier plus display name) and the identifier needs the
 * explanation that it is not free to rename.
 *
 * Deleting stays a two-click inline confirm — deleting a record is never a dialog.
 */
export function EnvironmentsSection({
	environments,
	envError,
	onCreate,
	onEdit,
	onDelete,
	saving,
}: EnvironmentsSectionProps) {
	// Purely ephemeral UI state, so it stays local rather than in the page reducer.
	const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

	return (
		<SectionCard
			title="Environments"
			icon={Layers}
			action={
				<Button type="button" icon={Plus} onClick={onCreate} disabled={saving}>
					New environment
				</Button>
			}
		>
			<Banner variant="error" message={envError} />

			{environments.length === 0 ? (
				<EmptyState
					icon={Layers}
					title="No environments yet"
					description="Environments group clients and scope password policies to a deployment."
					action={
						<Button type="button" icon={Plus} onClick={onCreate}>
							New environment
						</Button>
					}
				/>
			) : (
				<ul className="divide-y divide-border overflow-hidden rounded-card border border-border">
					{environments.map((env) => (
						<li key={env.id} className="flex items-center justify-between gap-2 px-3 py-2">
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
										onClick={() => onEdit(env)}
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
						</li>
					))}
				</ul>
			)}
		</SectionCard>
	);
}
