import { useRef } from "react";
import { ImageIcon } from "lucide-react";
import { Banner, Button, Input } from "@/components/ui";
import type { UserRecord } from "@/lib/repositories/admin.repository";
import type { Environment } from "@/lib/repositories/environment.repository";
import { UserAvatar } from "./user-avatar";
import type { UserDraft } from "./user-draft";

interface UserFormProps {
	/** Links the panel footer's submit button to this form via the `form` attribute. */
	formId: string;
	draft: UserDraft;
	onChange: (patch: Partial<UserDraft>) => void;
	environments: Environment[];
	/** null when creating; a password is required in that case. */
	editingId: string | null;
	/** The record being edited, for the avatar. null while creating. */
	user: UserRecord | null;
	uploadingAvatar: boolean;
	onAvatarUpload: (userId: string, file: File) => void;
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
	user,
	uploadingAvatar,
	onAvatarUpload,
	error,
	onSubmit,
}: UserFormProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);
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

			{user ? (
				<div className="flex items-center gap-4">
					{/* Shows the picked file straight away, while the record still holds the
					    old avatar — nothing is replaced until the form is saved. */}
					{draft.avatarPreviewUrl ? (
						// eslint-disable-next-line @next/next/no-img-element -- local object URL
						<img
							src={draft.avatarPreviewUrl}
							alt=""
							className="h-16 w-16 shrink-0 rounded-full border border-border bg-surface-sunken object-cover"
						/>
					) : (
						<UserAvatar user={user} className="h-16 w-16" />
					)}
					<div>
						{/* Uploads immediately rather than joining the draft: it is a separate
						    multipart endpoint, not part of the user record this form saves. */}
						<input
							ref={fileInputRef}
							type="file"
							accept="image/*"
							className="hidden"
							onChange={(e) => {
								const file = e.target.files?.[0];
								if (file && user) onAvatarUpload(user.id, file);
								// Reset so picking the same file twice still fires onChange.
								e.target.value = "";
							}}
						/>
						<Button
							type="button"
							variant="secondary"
							icon={ImageIcon}
							loading={uploadingAvatar}
							onClick={() => fileInputRef.current?.click()}
						>
							Change photo
						</Button>
						<p className="mt-1 text-xs text-muted-foreground">
							{draft.avatarStagedKey
								? "Replaces the current photo when you save."
								: "Applied when you save."}
						</p>
					</div>
				</div>
			) : null}

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
