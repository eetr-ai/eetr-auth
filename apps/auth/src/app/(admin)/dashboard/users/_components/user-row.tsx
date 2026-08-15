import type { FormEvent } from "react";
import { Pencil, RotateCcw, Trash2 } from "lucide-react";
import { IconButton, InlineDeleteConfirm } from "@/components/ui";
import type { UserRecord } from "@/lib/repositories/admin.repository";
import type { Environment } from "@/lib/repositories/environment.repository";
import { UserAvatar } from "./user-avatar";
import { VerificationStatus } from "./verification-status";
import { EditUserForm } from "./edit-user-form";

interface UserRowProps {
	user: UserRecord;
	environments: Environment[];
	isEditing: boolean;
	editingUsername: string;
	onEditingUsernameChange: (value: string) => void;
	editingName: string;
	onEditingNameChange: (value: string) => void;
	editingEmail: string;
	onEditingEmailChange: (value: string) => void;
	editingPassword: string;
	onEditingPasswordChange: (value: string) => void;
	editingIsAdmin: boolean;
	onEditingIsAdminChange: (value: boolean) => void;
	editingEnvironmentIds: string[];
	onEditingEnvironmentIdsChange: (ids: string[]) => void;
	onUpdate: (e: FormEvent) => void;
	onCancelEdit: () => void;
	onStartEdit: () => void;
	isUploadingAvatar: boolean;
	avatarUploadDisabled: boolean;
	onAvatarUpload: (file: File) => void;
	isResettingVerification: boolean;
	onResetVerification: () => void;
	isConfirmingDelete: boolean;
	isDeleting: boolean;
	onRequestDelete: () => void;
	onConfirmDelete: () => void;
	onCancelDelete: () => void;
}

export function UserRow({
	user,
	environments,
	isEditing,
	editingUsername,
	onEditingUsernameChange,
	editingName,
	onEditingNameChange,
	editingEmail,
	onEditingEmailChange,
	editingPassword,
	onEditingPasswordChange,
	editingIsAdmin,
	onEditingIsAdminChange,
	editingEnvironmentIds,
	onEditingEnvironmentIdsChange,
	onUpdate,
	onCancelEdit,
	onStartEdit,
	isUploadingAvatar,
	avatarUploadDisabled,
	onAvatarUpload,
	isResettingVerification,
	onResetVerification,
	isConfirmingDelete,
	isDeleting,
	onRequestDelete,
	onConfirmDelete,
	onCancelDelete,
}: UserRowProps) {
	return (
		<li className="rounded-card border border-border px-3 py-2">
			{isEditing ? (
				<EditUserForm
					username={editingUsername}
					onUsernameChange={onEditingUsernameChange}
					name={editingName}
					onNameChange={onEditingNameChange}
					email={editingEmail}
					onEmailChange={onEditingEmailChange}
					password={editingPassword}
					onPasswordChange={onEditingPasswordChange}
					isAdmin={editingIsAdmin}
					onIsAdminChange={onEditingIsAdminChange}
					environments={environments}
					environmentIds={editingEnvironmentIds}
					onEnvironmentIdsChange={onEditingEnvironmentIdsChange}
					onSubmit={onUpdate}
					onCancel={onCancelEdit}
				/>
			) : (
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3">
						<UserAvatar user={user} />
						<div className="flex flex-col">
							<span className="font-medium">{user.name ?? user.username}</span>
							<span className="text-xs text-muted-foreground">@{user.username}</span>
							{user.email && (
								<span className="text-xs text-muted-foreground">{user.email}</span>
							)}
							<VerificationStatus user={user} />
							<span className="text-xs text-muted-foreground">
								{user.isAdmin ? "Admin" : "User"}
							</span>
							<EnvironmentBadges user={user} environments={environments} />
						</div>
					</div>
					<div className="flex items-center gap-2">
						{isConfirmingDelete ? (
							<InlineDeleteConfirm
								label={`Delete ${user.username || user.email || "user"}?`}
								busy={isDeleting}
								onConfirm={onConfirmDelete}
								onCancel={onCancelDelete}
							/>
						) : (
							<>
								<label className="cursor-pointer rounded-full border border-border px-2 py-1 text-xs hover:bg-surface-hover">
									{isUploadingAvatar ? "Uploading..." : "Photo"}
									<input
										type="file"
										accept="image/jpeg,image/png,image/webp"
										disabled={avatarUploadDisabled}
										className="hidden"
										onChange={(e) => {
											const file = e.target.files?.[0];
											if (file) {
												onAvatarUpload(file);
											}
											e.currentTarget.value = "";
										}}
									/>
								</label>
								{user.email?.trim() && user.emailVerifiedAt && !user.isAdmin ? (
									<button
										type="button"
										onClick={onResetVerification}
										disabled={isResettingVerification}
										className="rounded-full border border-border px-2 py-1 text-xs hover:bg-surface-hover disabled:opacity-50"
									>
										<span className="inline-flex items-center gap-1">
											<RotateCcw className="h-3.5 w-3.5" />
											{isResettingVerification ? "Resetting..." : "Require re-verify"}
										</span>
									</button>
								) : null}
								<IconButton aria-label="Edit user" onClick={onStartEdit}>
									<Pencil className="h-4 w-4" />
								</IconButton>
								<IconButton variant="danger" aria-label="Delete user" onClick={onRequestDelete}>
									<Trash2 className="h-4 w-4" />
								</IconButton>
							</>
						)}
					</div>
				</div>
			)}
		</li>
	);
}

function EnvironmentBadges({
	user,
	environments,
}: {
	user: UserRecord;
	environments: Environment[];
}) {
	const nameById = new Map(environments.map((env) => [env.id, env.name]));
	const names = (user.environmentIds ?? [])
		.map((id) => nameById.get(id))
		.filter((name): name is string => !!name)
		.sort((a, b) => a.localeCompare(b));

	if (names.length === 0) {
		return <span className="mt-1 text-xs text-muted-foreground">No environments</span>;
	}

	return (
		<div className="mt-1 flex flex-wrap gap-1">
			{names.map((name) => (
				<span
					key={name}
					className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs text-muted-foreground"
				>
					{name}
				</span>
			))}
		</div>
	);
}
