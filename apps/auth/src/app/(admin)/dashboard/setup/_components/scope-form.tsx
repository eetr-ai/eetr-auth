import { Banner, Input } from "@/components/ui";
import type { ScopeDraft } from "./scope-draft";

interface ScopeFormProps {
	/** Links the panel footer's submit button to this form via the `form` attribute. */
	formId: string;
	draft: ScopeDraft;
	onChange: (patch: Partial<ScopeDraft>) => void;
	/** null when creating. The scope name is fixed after creation. */
	editingId: string | null;
	/** Save errors render here rather than on the page, which sits behind the scrim. */
	error: string | null;
	onSubmit: (e: React.FormEvent) => void;
}

export function ScopeForm({
	formId,
	draft,
	onChange,
	editingId,
	error,
	onSubmit,
}: ScopeFormProps) {
	const readOnlyName = editingId !== null;

	return (
		<form id={formId} onSubmit={onSubmit} className="space-y-4">
			<Banner variant="error" message={error} />

			<label className="block text-sm">
				<span className="mb-1 block text-muted-foreground">Scope name</span>
				<Input
					type="text"
					required
					readOnly={readOnlyName}
					disabled={readOnlyName}
					value={draft.scopeName}
					onChange={(e) => onChange({ scopeName: e.target.value })}
					placeholder="read:users"
				/>
				<span className="mt-1 block text-xs text-muted-foreground">
					{readOnlyName
						? "Fixed after creation — clients request this exact value."
						: "The value clients send in the scope parameter."}
				</span>
			</label>

			<label className="block text-sm">
				<span className="mb-1 block text-muted-foreground">Consent label (optional)</span>
				<Input
					type="text"
					value={draft.displayName}
					onChange={(e) => onChange({ displayName: e.target.value })}
					placeholder="Your email address"
				/>
			</label>

			<label className="block text-sm">
				<span className="mb-1 block text-muted-foreground">
					What the user is agreeing to (optional)
				</span>
				<Input
					type="text"
					value={draft.description}
					onChange={(e) => onChange({ description: e.target.value })}
					placeholder="See your email address and whether it is verified."
				/>
				<span className="mt-1 block text-xs text-muted-foreground">
					Shown on the consent screen. Leave both blank to show the scope name instead.
				</span>
			</label>
		</form>
	);
}
