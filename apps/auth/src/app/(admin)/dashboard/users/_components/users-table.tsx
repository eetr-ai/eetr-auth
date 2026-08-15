import { useRef } from "react";
import { ImageIcon, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { IconButton, InlineDeleteConfirm, TBody, THead, Table, Td, Th } from "@/components/ui";
import type { UserRecord } from "@/lib/repositories/admin.repository";
import type { Environment } from "@/lib/repositories/environment.repository";
import { UserAvatar } from "./user-avatar";
import { VerificationStatus } from "./verification-status";

interface UsersTableProps {
	users: UserRecord[];
	environments: Environment[];
	uploadingAvatarUserId: string | null;
	onAvatarUpload: (userId: string, file: File) => void;
	resettingVerificationUserId: string | null;
	onResetVerification: (user: UserRecord) => void;
	onStartEdit: (user: UserRecord) => void;
	confirmingDeleteUserId: string | null;
	deletingUserId: string | null;
	onRequestDelete: (user: UserRecord) => void;
	onConfirmDelete: (user: UserRecord) => void;
	onCancelDelete: () => void;
}

export function UsersTable({
	users,
	environments,
	uploadingAvatarUserId,
	onAvatarUpload,
	resettingVerificationUserId,
	onResetVerification,
	onStartEdit,
	confirmingDeleteUserId,
	deletingUserId,
	onRequestDelete,
	onConfirmDelete,
	onCancelDelete,
}: UsersTableProps) {
	const envById = new Map(environments.map((env) => [env.id, env.name]));

	return (
		<Table minWidth="min-w-[840px]">
			<THead>
				<Th>User</Th>
				<Th>Email</Th>
				<Th>Role</Th>
				<Th>Environments</Th>
				<Th className="text-right">Actions</Th>
			</THead>
			<TBody>
				{users.map((user) => (
					<UserTableRow
						key={user.id}
						user={user}
						envById={envById}
						isUploadingAvatar={uploadingAvatarUserId === user.id}
						onAvatarUpload={onAvatarUpload}
						isResettingVerification={resettingVerificationUserId === user.id}
						onResetVerification={onResetVerification}
						onStartEdit={onStartEdit}
						isConfirmingDelete={confirmingDeleteUserId === user.id}
						isDeleting={deletingUserId === user.id}
						onRequestDelete={onRequestDelete}
						onConfirmDelete={onConfirmDelete}
						onCancelDelete={onCancelDelete}
					/>
				))}
			</TBody>
		</Table>
	);
}

interface UserTableRowProps {
	user: UserRecord;
	envById: Map<string, string>;
	isUploadingAvatar: boolean;
	onAvatarUpload: (userId: string, file: File) => void;
	isResettingVerification: boolean;
	onResetVerification: (user: UserRecord) => void;
	onStartEdit: (user: UserRecord) => void;
	isConfirmingDelete: boolean;
	isDeleting: boolean;
	onRequestDelete: (user: UserRecord) => void;
	onConfirmDelete: (user: UserRecord) => void;
	onCancelDelete: () => void;
}

function UserTableRow({
	user,
	envById,
	isUploadingAvatar,
	onAvatarUpload,
	isResettingVerification,
	onResetVerification,
	onStartEdit,
	isConfirmingDelete,
	isDeleting,
	onRequestDelete,
	onConfirmDelete,
	onCancelDelete,
}: UserTableRowProps) {
	// One hidden input per row so the file picker targets this user only.
	const fileInputRef = useRef<HTMLInputElement>(null);
	const label = user.name ?? user.username;
	const envNames = (user.environmentIds ?? [])
		.map((id) => envById.get(id))
		.filter((name): name is string => !!name)
		.sort((a, b) => a.localeCompare(b));

	return (
		<tr>
			<Td>
				<div className="flex items-center gap-3">
					<UserAvatar user={user} />
					<div className="min-w-0">
						<div className="truncate font-medium">{label}</div>
						<div className="truncate text-xs text-muted-foreground">@{user.username}</div>
					</div>
				</div>
			</Td>
			<Td>
				<div className="flex flex-col gap-1">
					<span className="truncate">{user.email?.trim() ? user.email : "—"}</span>
					<VerificationStatus user={user} />
				</div>
			</Td>
			<Td className="text-muted-foreground">{user.isAdmin ? "Admin" : "User"}</Td>
			<Td>
				{envNames.length === 0 ? (
					<span className="text-xs text-muted-foreground">None</span>
				) : (
					<div className="flex flex-wrap gap-1">
						{envNames.map((name) => (
							<span
								key={name}
								className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs text-muted-foreground"
							>
								{name}
							</span>
						))}
					</div>
				)}
			</Td>
			<Td>
				<div className="flex items-center justify-end gap-1">
					{isConfirmingDelete ? (
						<InlineDeleteConfirm
							label={`Delete ${label}?`}
							busy={isDeleting}
							onConfirm={() => onConfirmDelete(user)}
							onCancel={onCancelDelete}
						/>
					) : (
						<>
							<input
								ref={fileInputRef}
								type="file"
								accept="image/*"
								className="hidden"
								onChange={(e) => {
									const file = e.target.files?.[0];
									if (file) onAvatarUpload(user.id, file);
									// Reset so picking the same file twice still fires onChange.
									e.target.value = "";
								}}
							/>
							<IconButton
								type="button"
								aria-label={`Upload a photo for ${label}`}
								title="Upload photo"
								loading={isUploadingAvatar}
								onClick={() => fileInputRef.current?.click()}
							>
								<ImageIcon className="h-4 w-4" />
							</IconButton>
							{user.email?.trim() && user.emailVerifiedAt ? (
								<IconButton
									type="button"
									aria-label={`Require ${label} to re-verify their email`}
									title="Require re-verification"
									loading={isResettingVerification}
									onClick={() => onResetVerification(user)}
								>
									<RotateCcw className="h-4 w-4" />
								</IconButton>
							) : null}
							<IconButton
								type="button"
								aria-label={`Edit ${label}`}
								title="Edit"
								onClick={() => onStartEdit(user)}
							>
								<Pencil className="h-4 w-4" />
							</IconButton>
							<IconButton
								type="button"
								variant="danger"
								aria-label={`Delete ${label}`}
								title="Delete"
								onClick={() => onRequestDelete(user)}
							>
								<Trash2 className="h-4 w-4" />
							</IconButton>
						</>
					)}
				</div>
			</Td>
		</tr>
	);
}
