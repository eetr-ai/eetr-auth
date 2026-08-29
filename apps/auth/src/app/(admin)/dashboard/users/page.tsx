"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, Plus, Users } from "lucide-react";
import {
	createUser,
	deleteUser,
	listUsers,
	updateUser,
} from "@/app/actions/user-actions";
import { listEnvironments } from "@/app/actions/environment-actions";
import { listUserConsents, revokeUserConsent } from "@/app/actions/consent-actions";
import type { ConsentWithClient } from "@/lib/repositories/consent.repository";
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
import { UserConsents } from "./_components/user-consents";
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
	const [consents, setConsents] = useState<ConsentWithClient[]>([]);
	const [consentsLoading, setConsentsLoading] = useState(false);
	const [revokingClientId, setRevokingClientId] = useState<string | null>(null);
	const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

	const dirty = isUserDraftDirty(draft, baseline);
	// An upload can outlive the panel it was started from. Results are applied
	// only while the same user is still being edited.
	const editingIdRef = useRef<string | null>(null);
	editingIdRef.current = editingId;
	// Derived from `users` rather than snapshotted, so the silent refetch after an
	// avatar upload refreshes the picture in the open panel.
	const editingUser = editingId ? (users.find((user) => user.id === editingId) ?? null) : null;

	// Consents belong to a saved user, so they load when the panel opens on an existing one
	// and are cleared otherwise — a create panel has nothing to show.
	useEffect(() => {
		if (!panelOpen || !editingId) {
			setConsents([]);
			return;
		}
		let cancelled = false;
		setConsentsLoading(true);
		listUserConsents(editingId)
			.then((rows) => {
				if (!cancelled) setConsents(rows);
			})
			.catch(() => {
				if (!cancelled) setConsents([]);
			})
			.finally(() => {
				if (!cancelled) setConsentsLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [panelOpen, editingId]);

	const handleRevokeConsent = async (clientRowId: string) => {
		if (!editingId) return;
		setRevokingClientId(clientRowId);
		try {
			await revokeUserConsent(editingId, clientRowId);
			setConsents(await listUserConsents(editingId));
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to revoke consent");
		} finally {
			setRevokingClientId(null);
		}
	};

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

	// closePanel releases the preview on every normal dismissal, but navigating
	// away with the panel open unmounts without passing through it.
	const avatarPreviewUrlRef = useRef<string | null>(null);
	avatarPreviewUrlRef.current = draft.avatarPreviewUrl;
	useEffect(
		() => () => {
			if (avatarPreviewUrlRef.current) URL.revokeObjectURL(avatarPreviewUrlRef.current);
		},
		[],
	);

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
		// The staged object itself is swept by the bucket's lifecycle rule; this
		// just releases the local preview.
		setDraft((prev) => {
			if (prev.avatarPreviewUrl) URL.revokeObjectURL(prev.avatarPreviewUrl);
			return { ...prev, avatarPreviewUrl: null };
		});
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
		// A photo still uploading has no staged key yet, so saving now would persist
		// the rest of the form and silently drop the picture.
		if (uploadingAvatarUserId) return;
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
					...(draft.avatarStagedKey ? { avatarStagedKey: draft.avatarStagedKey } : {}),
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

	/**
	 * Uploads to staging and records the key on the draft. The live avatar is
	 * only replaced when the form is saved, so cancelling changes nothing.
	 */
	const handleAvatarUpload = async (userId: string, file: File) => {
		setError(null);
		setUploadingAvatarUserId(userId);
		try {
			const formData = new FormData();
			formData.set("userId", userId);
			formData.set("file", file);
			const response = await fetch("/api/users/avatar/stage", { method: "POST", body: formData });
			const payload = (await response.json().catch(() => null)) as
				| { stagedKey?: string; error_description?: string; error?: string }
				| null;
			if (!response.ok || !payload?.stagedKey) {
				throw new Error(payload?.error_description ?? payload?.error ?? "Failed to upload photo");
			}
			if (editingIdRef.current !== userId) {
				// The panel moved on (or closed) while this was in flight. The staged
				// object is left for the lifecycle rule rather than applied to whoever
				// is on screen now.
				return;
			}
			setDraft((prev) => {
				// Release the previous preview so picking repeatedly does not leak.
				if (prev.avatarPreviewUrl) URL.revokeObjectURL(prev.avatarPreviewUrl);
				return {
					...prev,
					avatarStagedKey: payload.stagedKey ?? null,
					avatarPreviewUrl: URL.createObjectURL(file),
				};
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to upload photo");
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
					user={editingUser}
					uploadingAvatar={uploadingAvatarUserId === editingId}
					onAvatarUpload={(userId, file) => void handleAvatarUpload(userId, file)}
					error={error}
					onSubmit={handleSubmit}
				/>
				{editingId && (
					<UserConsents
						consents={consents}
						loading={consentsLoading}
						revokingClientId={revokingClientId}
						onRevoke={(clientRowId) => void handleRevokeConsent(clientRowId)}
					/>
				)}
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
