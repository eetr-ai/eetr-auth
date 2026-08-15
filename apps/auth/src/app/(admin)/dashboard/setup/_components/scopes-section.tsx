import { useState, type FormEvent } from "react";
import type { ReducerAction } from "@eetr/react-reducer-utils";
import { Plus, Tag, Trash2 } from "lucide-react";
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
	scopeError: string | null;
	dispatch: (action: ReducerAction<SetupPageActionType>) => void;
	onCreate: (e: FormEvent) => void;
	onDelete: (id: string) => void;
	/** A mutation is in flight; disable the controls so it cannot be double-submitted. */
	saving: boolean;
}

export function ScopesSection({
	scopes,
	scopeName,
	scopeError,
	dispatch,
	onCreate,
	onDelete,
	saving,
}: ScopesSectionProps) {
	// Purely ephemeral UI state, so it stays local rather than in the page reducer.
	const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

	return (
		<SectionCard title="Scopes" icon={Tag}>
			<Banner variant="error" message={scopeError} />
			<form onSubmit={onCreate} className="mb-4 flex gap-2">
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
							<li key={scope.id} className="flex items-center justify-between gap-2 px-3 py-2">
							<span className="min-w-0 truncate font-medium">{scope.scopeName}</span>
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
							)}
						</li>
					))}
				</ul>
			)}
		</SectionCard>
	);
}
