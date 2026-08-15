import { Plus, Trash2 } from "lucide-react";
import { Banner, IconButton, Input, Select } from "@/components/ui";
import type { Environment } from "@/lib/repositories/environment.repository";
import type { Scope } from "@/lib/repositories/scope.repository";
import type { ClientDraft } from "./client-draft";

interface ClientFormProps {
	/** Links the panel footer's submit button to this form via the `form` attribute. */
	formId: string;
	draft: ClientDraft;
	onChange: (patch: Partial<ClientDraft>) => void;
	environments: Environment[];
	scopes: Scope[];
	/** null when creating. Environment and expiry are fixed after creation. */
	editingId: string | null;
	/** Dynamically registered clients are owned by their software; show, don't edit. */
	readOnly?: boolean;
	/** Save errors render here rather than on the page, which sits behind the scrim. */
	error: string | null;
	onSubmit: (e: React.FormEvent) => void;
}

export function ClientForm({
	formId,
	draft,
	onChange,
	environments,
	scopes,
	editingId,
	readOnly = false,
	error,
	onSubmit,
}: ClientFormProps) {
	const setUriAt = (index: number, value: string) =>
		onChange({ redirectUris: draft.redirectUris.map((uri, i) => (i === index ? value : uri)) });

	const removeUriAt = (index: number) => {
		const next = draft.redirectUris.filter((_, i) => i !== index);
		// Always leave one row, or there is nothing to type into.
		onChange({ redirectUris: next.length > 0 ? next : [""] });
	};

	const toggleScope = (scopeId: string) =>
		onChange({
			scopeIds: draft.scopeIds.includes(scopeId)
				? draft.scopeIds.filter((id) => id !== scopeId)
				: [...draft.scopeIds, scopeId],
		});

	const environmentName =
		environments.find((env) => env.id === draft.environmentId)?.name ?? draft.environmentId;

	return (
		<form id={formId} onSubmit={onSubmit} className="space-y-4">
			<Banner variant="error" message={error} />

			<label className="block text-sm">
				<span className="mb-1 block text-muted-foreground">Name (optional)</span>
				<Input
					type="text"
					data-autofocus
					readOnly={readOnly}
					disabled={readOnly}
					value={draft.name}
					onChange={(e) => onChange({ name: e.target.value })}
					placeholder="Web app"
				/>
			</label>

			<label className="block text-sm">
				<span className="mb-1 block text-muted-foreground">Environment</span>
				{editingId || readOnly ? (
					// Moving a client between environments would invalidate its tokens,
					// so it is fixed at creation. Shown disabled rather than hidden.
					<Input type="text" value={environmentName} readOnly disabled />
				) : (
					<Select
						required
						value={draft.environmentId}
						onChange={(e) => onChange({ environmentId: e.target.value })}
						className="w-full px-3 py-2"
					>
						<option value="">Select an environment</option>
						{environments.map((env) => (
							<option key={env.id} value={env.id}>
								{env.name}
							</option>
						))}
					</Select>
				)}
			</label>

			<div>
				<span className="mb-1 block text-sm text-muted-foreground">Redirect URIs</span>
				<div className="space-y-2">
					{/* Keyed by position: an unsaved URI row has no stable id. */}
					{draft.redirectUris.map((uri, index) => (
						<div key={index} className="flex items-center gap-2">
							<Input
								type="url"
								aria-label={`Redirect URI ${index + 1}`}
								readOnly={readOnly}
								disabled={readOnly}
								value={uri}
								onChange={(e) => setUriAt(index, e.target.value)}
								placeholder="https://app.example.com/callback"
								className="flex-1"
							/>
							{readOnly ? null : (
							<IconButton
								type="button"
								variant="danger"
								aria-label={`Remove redirect URI ${index + 1}`}
								title="Remove"
								onClick={() => removeUriAt(index)}
							>
								<Trash2 className="h-4 w-4" />
							</IconButton>
							)}
						</div>
					))}
				</div>
				{readOnly ? null : (
					<button
						type="button"
						onClick={() => onChange({ redirectUris: [...draft.redirectUris, ""] })}
						className="mt-2 inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs hover:bg-surface-hover"
					>
						<Plus className="h-3.5 w-3.5" />
						Add URI
					</button>
				)}
			</div>

			<div>
				<span className="mb-1 block text-sm text-muted-foreground">Scopes</span>
				{scopes.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No scopes defined. Add them under Setup › Basic.
					</p>
				) : (
					<div className="flex flex-wrap gap-3">
						{scopes.map((scope) => (
							<label key={scope.id} className={`flex items-center gap-2 text-sm ${readOnly ? "opacity-70" : "cursor-pointer"}`}>
								<input
									type="checkbox"
									disabled={readOnly}
									checked={draft.scopeIds.includes(scope.id)}
									onChange={() => toggleScope(scope.id)}
									className="rounded-chip border-border"
								/>
								<span>{scope.scopeName}</span>
							</label>
						))}
					</div>
				)}
			</div>

			{editingId ? null : (
				<label className="block text-sm">
					<span className="mb-1 block text-muted-foreground">Expires at (optional)</span>
					<Input
						type="datetime-local"
						value={draft.expiresAt}
						onChange={(e) => onChange({ expiresAt: e.target.value })}
					/>
				</label>
			)}
		</form>
	);
}
