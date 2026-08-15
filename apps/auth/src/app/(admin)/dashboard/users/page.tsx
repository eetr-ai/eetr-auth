"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Users } from "lucide-react";
import {
	createUser,
	deleteUser,
	listUsers,
	updateUser,
} from "@/app/actions/user-actions";
import { listEnvironments } from "@/app/actions/environment-actions";
import type { UserRecord } from "@/lib/repositories/admin.repository";
import type { Environment } from "@/lib/repositories/environment.repository";
import {
	Banner,
	Button,
	ConfirmDialog,
	EmptyState,
	FullPageSpinner,
	PageHeader,
	SidePanel,
} from "@/components/ui";
import {
	draftFromUser,
	emptyDraft,
	isUserDraftDirty,
	type UserDraft,
} from "./_components/user-draft";
import { UserForm } from "./_components/user-form";
import { UsersTable } from "./_components/users-table";

/** The form lives in the panel body; its submit button lives in the panel footer. */
const FORM_ID = "user-form";

export default function UsersPage() {
	const [users, setUsers] = useState<UserRecord[]>([]);
	const [environments, setEnvironments] = useState<Environment[]>([]);
	const [initialLoading, setInitialLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const [panelOpen, setPanelOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [draft, setDraft] = useState<UserDraft>(emptyDraft);
	const [baseline, setBaseline] = useState<UserDraft>(emptyDraft);
	const [confirmingDiscard, setConfirmingDiscard] = useState(false);
	const [saving, setSaving] = useState(false);

	const [uploadingAvatarUserId, setUploadingAvatarUserId] = useState<string | null>(null);
	const [resettingVerificationUserId, setResettingVerificationUserId] = useState<string | null>(
		null,
	);
	const [confirmingDeleteUserId, setConfirmingDeleteUserId] = useState<string | null>(null);
	const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

	const dirty = isUserDraftDirty(draft, baseline);

	/**
	 * `silent` skips the full-page spinner. Post-mutation refreshes must be
	 * silent: swapping the page for a spinner would unmount an open side panel
	 * mid-animation, and the acting control shows its own in-flight state.
	 */
	const load = async ({ silent = false }: { silent?: boolean } = {}) => {
		try {
			const [items, envs] = await Promise.all([listUsers(), listEnvironments()]);
			setUsers(items);
			setEnvironments(envs);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load users");
		} finally {
			if (!silent) setInitialLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	const openCreate = () => {
		setError(null);
		setEditingId(null);
		setDraft(emptyDraft);
		setBaseline(emptyDraft);
		setPanelOpen(true);
	};

	const startEdit = (user: UserRecord) => {
		setError(null);
		const next = draftFromUser(user);
		setEditingId(user.id);
		setDraft(next);
		setBaseline(next);
		setPanelOpen(true);
	};

	// Deliberately does not reset draft/editingId: the panel keeps rendering its
	// children while it animates out. Every open path re-initialises both.
	const closePanel = () => {
		setConfirmingDiscard(false);
		setPanelOpen(false);
		setError(null);
	};

	const requestClose = () => {
		// The panel stays mounted for its exit animation, so without this a second
		// Escape would re-open the discard dialog over an already-closing panel.
		if (!panelOpen || saving) return;
		if (dirty) setConfirmingDiscard(true);
		else closePanel();
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setSaving(true);
		setError(null);
		try {
			if (editingId) {
				await updateUser(editingId, {
					username: draft.username,
					name: draft.name,
					email: draft.email,
					// Omit rather than send "" — blank means "keep the current password",
					// so there is no reason to put it on the wire at all.
					...(draft.password ? { password: draft.password } : {}),
					isAdmin: draft.isAdmin,
					environmentIds: draft.environmentIds,
				});
			} else {
				// createUser cannot take environments, so assigning them on create is a
				// second call. If it fails the user still exists — the message says so
				// rather than implying nothing was created.
				const created = await createUser(
					draft.username,
					draft.password,
					draft.isAdmin,
					draft.name,
					draft.email,
				);
				if (draft.environmentIds.length > 0 && created?.id) {
					try {
						await updateUser(created.id, { environmentIds: draft.environmentIds });
					} catch (err) {
						await load({ silent: true });
						setError(
							`User created, but assigning environments failed: ${
								err instanceof Error ? err.message : "unknown error"
							}`,
						);
						return;
					}
				}
			}
			await load({ silent: true });
			closePanel();
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: `Failed to ${editingId ? "update" : "create"} user`,
			);
		} finally {
			setSaving(false);
		}
	};

	const confirmDelete = async (user: UserRecord) => {
		setError(null);
		setDeletingUserId(user.id);
		try {
			await deleteUser(user.id);
			setConfirmingDeleteUserId(null);
			await load({ silent: true });
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to delete user");
		} finally {
			setDeletingUserId(null);
		}
	};

	const handleAvatarUpload = async (userId: string, file: File) => {
		setError(null);
		setUploadingAvatarUserId(userId);
		try {
			const formData = new FormData();
			formData.set("userId", userId);
			formData.set("file", file);
			const response = await fetch("/api/users/avatar", { method: "POST", body: formData });
			if (!response.ok) {
				const payload = (await response.json().catch(() => null)) as
					| { error_description?: string; error?: string }
					| null;
				throw new Error(payload?.error_description ?? payload?.error ?? "Failed to upload avatar");
			}
			await load({ silent: true });
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to upload avatar");
		} finally {
			setUploadingAvatarUserId(null);
		}
	};

	const handleResetVerification = async (user: UserRecord) => {
		setError(null);
		setResettingVerificationUserId(user.id);
		try {
			await updateUser(user.id, { emailVerifiedAt: null });
			await load({ silent: true });
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to reset email verification");
		} finally {
			setResettingVerificationUserId(null);
		}
	};

	if (initialLoading) {
		return <FullPageSpinner />;
	}

	const newUserButton = (
		<Button type="button" icon={Plus} onClick={openCreate}>
			New user
		</Button>
	);

	return (
		<main className="min-h-screen bg-background p-6 text-foreground">
			<PageHeader icon={Users} title="Users" action={newUserButton} />

			{/* Save errors surface inside the panel; list-level errors here. */}
			<Banner variant="error" message={panelOpen ? null : error} />

			{users.length === 0 ? (
				<EmptyState
					icon={Users}
					title="No users yet"
					description="Create the first account that can sign in to this tenant."
					action={newUserButton}
				/>
			) : (
				<UsersTable
					users={users}
					environments={environments}
					uploadingAvatarUserId={uploadingAvatarUserId}
					onAvatarUpload={(userId, file) => void handleAvatarUpload(userId, file)}
					resettingVerificationUserId={resettingVerificationUserId}
					onResetVerification={handleResetVerification}
					onStartEdit={startEdit}
					confirmingDeleteUserId={confirmingDeleteUserId}
					deletingUserId={deletingUserId}
					onRequestDelete={(user) => {
						setError(null);
						setConfirmingDeleteUserId(user.id);
					}}
					onConfirmDelete={confirmDelete}
					onCancelDelete={() => setConfirmingDeleteUserId(null)}
				/>
			)}

			<SidePanel
				open={panelOpen}
				onRequestClose={requestClose}
				icon={Users}
				title={editingId ? "Edit user" : "New user"}
				description={
					editingId
						? "Leave the password blank to keep the current one."
						: "The account can sign in as soon as it is created."
				}
				footer={
					<div className="flex items-center gap-2">
						<Button type="submit" form={FORM_ID} icon={editingId ? Pencil : Plus} loading={saving}>
							{editingId ? "Save user" : "Add user"}
						</Button>
						<Button type="button" variant="secondary" onClick={requestClose} disabled={saving}>
							Cancel
						</Button>
					</div>
				}
			>
				<UserForm
					formId={FORM_ID}
					draft={draft}
					onChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
					environments={environments}
					editingId={editingId}
					error={error}
					onSubmit={handleSubmit}
				/>
			</SidePanel>

			<ConfirmDialog
				open={confirmingDiscard}
				title="Discard changes?"
				description="This user has unsaved edits. Closing the panel will lose them."
				confirmLabel="Discard changes"
				cancelLabel="Keep editing"
				emphasis="cancel"
				onConfirm={closePanel}
				onCancel={() => setConfirmingDiscard(false)}
			/>
		</main>
	);
}
