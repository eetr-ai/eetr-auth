import type { FormEvent } from "react";
import type { ReducerAction } from "@eetr/react-reducer-utils";
import { Plus, Trash2 } from "lucide-react";
import { Banner, Button, IconButton, Input } from "@/components/ui";
import type { Scope } from "@/lib/repositories/scope.repository";
import { SetupPageActionType, type SetupTabId } from "./state";

interface ScopesSectionProps {
	activeTab: SetupTabId;
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
	activeTab,
	scopes,
	scopeName,
	scopeError,
	dispatch,
	onCreate,
	onDelete,
	saving,
}: ScopesSectionProps) {
	return (
		<section
			className={`mt-6 rounded-card border border-border p-6 ${activeTab !== "scopes" ? "hidden" : ""}`}
			role="tabpanel"
			id="setup-panel-scopes"
			aria-labelledby="setup-tab-scopes"
			aria-hidden={activeTab !== "scopes"}
		>
			<h2 className="mb-4 text-lg font-medium">Scopes</h2>
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
			<ul className="space-y-2">
				{scopes.map((scope) => (
					<li
						key={scope.id}
						className="flex items-center justify-between rounded-card border border-border px-3 py-2"
					>
						<span className="font-medium">{scope.scopeName}</span>
						<IconButton
							type="button"
							variant="danger"
							aria-label="Delete"
							disabled={saving}
										onClick={() => onDelete(scope.id)}
						>
							<Trash2 className="h-4 w-4" />
						</IconButton>
					</li>
				))}
				{scopes.length === 0 && (
					<li className="py-2 text-sm text-muted-foreground">
						No scopes yet. Add one above.
					</li>
				)}
			</ul>
		</section>
	);
}
