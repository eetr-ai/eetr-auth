import { Trash2 } from "lucide-react";
import { Banner, Button, Card, Input } from "@/components/ui";
import type { Environment } from "@/lib/repositories/environment.repository";
import type { Scope } from "@/lib/repositories/scope.repository";

interface CreateClientFormProps {
	environments: Environment[];
	scopes: Scope[];
	createName: string;
	onCreateNameChange: (v: string) => void;
	createEnvId: string;
	onCreateEnvIdChange: (v: string) => void;
	redirectUris: string[];
	onAddRedirectUri: () => void;
	onRedirectUriChange: (i: number, v: string) => void;
	onRemoveRedirectUri: (i: number) => void;
	selectedScopeIds: string[];
	onToggleScope: (scopeId: string) => void;
	expiresAt: string;
	onExpiresAtChange: (v: string) => void;
	creating: boolean;
	error: string | null;
	onSubmit: (e: React.FormEvent) => void;
	onCancel: () => void;
}

export function CreateClientForm({
	environments,
	scopes,
	createName,
	onCreateNameChange,
	createEnvId,
	onCreateEnvIdChange,
	redirectUris,
	onAddRedirectUri,
	onRedirectUriChange,
	onRemoveRedirectUri,
	selectedScopeIds,
	onToggleScope,
	expiresAt,
	onExpiresAtChange,
	creating,
	error,
	onSubmit,
	onCancel,
}: CreateClientFormProps) {
	return (
		<Card className="mt-6">
			<h2 className="mb-4 text-lg font-medium">New client</h2>
			<Banner variant="error" message={error} />
			<form onSubmit={onSubmit} className="space-y-4">
				<div>
					<label className="mb-1 block text-sm font-medium">Name (optional)</label>
					<Input
						type="text"
						value={createName}
						onChange={(e) => onCreateNameChange(e.target.value)}
						placeholder="e.g. Production API"
					/>
				</div>
				<div>
					<label className="mb-1 block text-sm font-medium">Environment</label>
					<select
						value={createEnvId}
						onChange={(e) => onCreateEnvIdChange(e.target.value)}
						required
						className="w-full rounded-xl border border-brand-muted bg-background px-3 py-2 text-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
					>
						<option value="">Select environment</option>
						{environments.map((e) => (
							<option key={e.id} value={e.id}>
								{e.name}
							</option>
						))}
					</select>
				</div>
				<div>
					<label className="mb-1 block text-sm font-medium">Redirect URIs (optional)</label>
					{redirectUris.map((uri, i) => (
						<div key={i} className="mb-2 flex gap-2">
							<input
								type="url"
								value={uri}
								onChange={(e) => onRedirectUriChange(i, e.target.value)}
								placeholder="https://..."
								className="flex-1 rounded-xl border border-brand-muted bg-background px-3 py-2 text-foreground placeholder:text-foreground/50 focus:border-brand focus:outline-none"
							/>
							<button
								type="button"
								onClick={() => onRemoveRedirectUri(i)}
								className="rounded-full p-2 text-muted-foreground hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/50 dark:hover:text-red-200"
								aria-label="Remove"
							>
								<Trash2 className="h-4 w-4" />
							</button>
						</div>
					))}
					<button
						type="button"
						onClick={onAddRedirectUri}
						className="text-sm text-brand hover:underline"
					>
						+ Add URI
					</button>
				</div>
				<div>
					<label className="mb-1 block text-sm font-medium">Scopes (optional)</label>
					<div className="flex flex-wrap gap-2">
						{scopes.map((s) => (
							<label key={s.id} className="flex cursor-pointer items-center gap-2">
								<input
									type="checkbox"
									checked={selectedScopeIds.includes(s.id)}
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
				</div>
				<div>
					<label className="mb-1 block text-sm font-medium">Expires at (optional)</label>
					<input
						type="datetime-local"
						value={expiresAt}
						onChange={(e) => onExpiresAtChange(e.target.value)}
						className="w-full rounded-xl border border-brand-muted bg-background px-3 py-2 text-foreground focus:border-brand focus:outline-none"
					/>
				</div>
				<div className="flex gap-2">
					<Button type="submit" disabled={creating}>
						{creating ? "Creating…" : "Create"}
					</Button>
					<Button type="button" variant="secondary" onClick={onCancel}>
						Cancel
					</Button>
				</div>
			</form>
		</Card>
	);
}
