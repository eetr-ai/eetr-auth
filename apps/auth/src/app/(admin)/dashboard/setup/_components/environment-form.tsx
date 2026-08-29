import { Banner, Input } from "@/components/ui";
import type { EnvironmentDraft } from "./environment-draft";

interface EnvironmentFormProps {
	/** Links the panel footer's submit button to this form via the `form` attribute. */
	formId: string;
	draft: EnvironmentDraft;
	onChange: (patch: Partial<EnvironmentDraft>) => void;
	/** Save errors render here rather than on the page, which sits behind the scrim. */
	error: string | null;
	onSubmit: (e: React.FormEvent) => void;
}

export function EnvironmentForm({
	formId,
	draft,
	onChange,
	error,
	onSubmit,
}: EnvironmentFormProps) {
	return (
		<form id={formId} onSubmit={onSubmit} className="space-y-4">
			<Banner variant="error" message={error} />

			<label className="block text-sm">
				<span className="mb-1 block text-muted-foreground">Environment name</span>
				<Input
					type="text"
					required
					value={draft.name}
					onChange={(e) => onChange({ name: e.target.value })}
					placeholder="production"
				/>
				<span className="mt-1 block text-xs text-muted-foreground">
					The identifier used in the <code>environment</code> token claim, in token
					validation, and in the activity log. Renaming it affects live tokens.
				</span>
			</label>

			<label className="block text-sm">
				<span className="mb-1 block text-muted-foreground">Display name (optional)</span>
				<Input
					type="text"
					value={draft.displayName}
					onChange={(e) => onChange({ displayName: e.target.value })}
					placeholder={draft.name.trim() || "Production (EU)"}
				/>
				<span className="mt-1 block text-xs text-muted-foreground">
					Shown throughout the dashboard. Leave blank to show the environment name.
				</span>
			</label>
		</form>
	);
}
