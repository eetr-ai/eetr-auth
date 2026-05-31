import type { FormEvent } from "react";
import { Users } from "lucide-react";
import { SectionCard } from "@/components/ui";
import type { UserRecord } from "@/lib/repositories/admin.repository";
import { UserRow } from "./user-row";

interface UsersSectionProps {
	users: UserRecord[];
	editingUserId: string | null;
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
	onUpdate: (e: FormEvent) => void;
	onCancelEdit: () => void;
	onStartEdit: (user: UserRecord) => void;
	uploadingAvatarUserId: string | null;
	onAvatarUpload: (userId: string, file: File) => void;
	resettingVerificationUserId: string | null;
	onResetVerification: (user: UserRecord) => void;
	confirmingDeleteUserId: string | null;
	deletingUserId: string | null;
	onRequestDelete: (user: UserRecord) => void;
	onConfirmDelete: (user: UserRecord) => void;
	onCancelDelete: () => void;
}

export function UsersSection({
	users,
	editingUserId,
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
	onUpdate,
	onCancelEdit,
	onStartEdit,
	uploadingAvatarUserId,
	onAvatarUpload,
	resettingVerificationUserId,
	onResetVerification,
	confirmingDeleteUserId,
	deletingUserId,
	onRequestDelete,
	onConfirmDelete,
	onCancelDelete,
}: UsersSectionProps) {
	return (
		<SectionCard title="Manage users" icon={Users}>
			<ul className="space-y-2">
				{users.map((user) => (
					<UserRow
						key={user.id}
						user={user}
						isEditing={editingUserId === user.id}
						editingUsername={editingUsername}
						onEditingUsernameChange={onEditingUsernameChange}
						editingName={editingName}
						onEditingNameChange={onEditingNameChange}
						editingEmail={editingEmail}
						onEditingEmailChange={onEditingEmailChange}
						editingPassword={editingPassword}
						onEditingPasswordChange={onEditingPasswordChange}
						editingIsAdmin={editingIsAdmin}
						onEditingIsAdminChange={onEditingIsAdminChange}
						onUpdate={onUpdate}
						onCancelEdit={onCancelEdit}
						onStartEdit={() => onStartEdit(user)}
						isUploadingAvatar={uploadingAvatarUserId === user.id}
						avatarUploadDisabled={uploadingAvatarUserId != null}
						onAvatarUpload={(file) => onAvatarUpload(user.id, file)}
						isResettingVerification={resettingVerificationUserId === user.id}
						onResetVerification={() => onResetVerification(user)}
						isConfirmingDelete={confirmingDeleteUserId === user.id}
						isDeleting={deletingUserId === user.id}
						onRequestDelete={() => onRequestDelete(user)}
						onConfirmDelete={() => onConfirmDelete(user)}
						onCancelDelete={onCancelDelete}
					/>
				))}
				{users.length === 0 && (
					<li className="py-2 text-sm text-muted-foreground">No users found.</li>
				)}
			</ul>
		</SectionCard>
	);
}
