import type { FormEvent } from "react";
import { Button, Card } from "@/components/ui";
import type { Scope } from "@/lib/repositories/scope.repository";

interface ScopesSectionProps {
	scopes: Scope[];
	scopeIds: string[];
	onToggleScope: (scopeId: string) => void;
	saving: boolean;
	onSubmit: (e: FormEvent) => void;
}

export function ScopesSection({ scopes, scopeIds, onToggleScope, saving, onSubmit }: ScopesSectionProps) {
	return (
		<Card>
			<h2 className="mb-3 text-lg font-medium">Scopes</h2>
			<form onSubmit={onSubmit} className="space-y-2">
				<div className="flex flex-wrap gap-3">
					{scopes.map((s) => (
						<label key={s.id} className="flex cursor-pointer items-center gap-2">
							<input
								type="checkbox"
								checked={scopeIds.includes(s.id)}
								onChange={() => onToggleScope(s.id)}
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
				<Button type="submit" disabled={saving} className="mt-2">
					{saving ? "Saving…" : "Save scopes"}
				</Button>
			</form>
		</Card>
	);
}
