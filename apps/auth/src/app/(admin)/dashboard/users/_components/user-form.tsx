import { Banner, Input } from "@/components/ui";
import type { Environment } from "@/lib/repositories/environment.repository";
import type { UserDraft } from "./user-draft";

interface UserFormProps {
	/** Links the panel footer's submit button to this form via the `form` attribute. */
	formId: string;
	draft: UserDraft;
	onChange: (patch: Partial<UserDraft>) => void;
	environments: Environment[];
	/** null when creating; a password is required in that case. */
	editingId: string | null;
	/** Save errors render here rather than in the page, which sits behind the scrim. */
	error: string | null;
	onSubmit: (e: React.FormEvent) => void;
}

export function UserForm({
	formId,
	draft,
	onChange,
	environments,
	editingId,
	error,
	onSubmit,
}: UserFormProps) {
	const toggleEnvironment = (id: string) => {
		onChange({
			environmentIds: draft.environmentIds.includes(id)
				? draft.environmentIds.filter((envId) => envId !== id)
				: [...draft.environmentIds, id],
		});
	};

	return (
		<form id={formId} onSubmit={onSubmit} className="space-y-4">
			<Banner variant="error" message={error} />

			<label className="block text-sm">
				<span className="mb-1 block text-muted-foreground">Username</span>
				<Input
					type="text"
					required
					data-autofocus
					value={draft.username}
					onChange={(e) => onChange({ username: e.target.value })}
					placeholder="username"
				/>
			</label>

			<label className="block text-sm">
				<span className="mb-1 block text-muted-foreground">Display name (optional)</span>
				<Input
					type="text"
					value={draft.name}
					onChange={(e) => onChange({ name: e.target.value })}
					placeholder="Ada Lovelace"
				/>
			</label>

			<label className="block text-sm">
				<span className="mb-1 block text-muted-foreground">Email (optional)</span>
				<Input
					type="email"
					value={draft.email}
					onChange={(e) => onChange({ email: e.target.value })}
					placeholder="ada@example.com"
				/>
			</label>

			<label className="block text-sm">
				<span className="mb-1 block text-muted-foreground">
					{editingId ? "New password (leave blank to keep)" : "Password"}
				</span>
				<Input
					type="password"
					required={!editingId}
					autoComplete="new-password"
					value={draft.password}
					onChange={(e) => onChange({ password: e.target.value })}
					placeholder={editingId ? "Unchanged" : "Password"}
				/>
			</label>

			<label className="flex items-center gap-2 text-sm">
				<input
					type="checkbox"
					checked={draft.isAdmin}
					onChange={(e) => onChange({ isAdmin: e.target.checked })}
					className="rounded-chip border-border"
				/>
				Is admin
			</label>

			<div>
				<span className="mb-1 block text-sm text-muted-foreground">Environments</span>
				{environments.length === 0 ? (
					<p className="text-sm text-muted-foreground">No environments defined.</p>
				) : (
					<div className="flex flex-wrap gap-3">
						{environments.map((env) => (
							<label key={env.id} className="flex cursor-pointer items-center gap-2 text-sm">
								<input
									type="checkbox"
									checked={draft.environmentIds.includes(env.id)}
									onChange={() => toggleEnvironment(env.id)}
									className="rounded-chip border-border"
								/>
								<span>{env.name}</span>
							</label>
						))}
					</div>
				)}
			</div>
		</form>
	);
}
