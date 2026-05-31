"use client";

import { ReducerAction, bootstrapProvider } from "@eetr/react-reducer-utils";
import { useEffect } from "react";
import { Users } from "lucide-react";
import {
	createUser,
	deleteUser,
	listUsers,
	updateUser,
} from "@/app/actions/user-actions";
import type { UserRecord } from "@/lib/repositories/admin.repository";
import { FullPageSpinner } from "@/components/ui";
import { CreateUserForm } from "./_components/create-user-form";
import { UsersSection } from "./_components/users-section";

enum UsersPageActionType {
	SET_USERS = "SET_USERS",
	SET_LOADING = "SET_LOADING",
	SET_ERROR = "SET_ERROR",
	SET_USERNAME = "SET_USERNAME",
	SET_NAME = "SET_NAME",
	SET_EMAIL = "SET_EMAIL",
	SET_PASSWORD = "SET_PASSWORD",
	SET_IS_ADMIN = "SET_IS_ADMIN",
	SET_EDITING_USER_ID = "SET_EDITING_USER_ID",
	SET_EDITING_USERNAME = "SET_EDITING_USERNAME",
	SET_EDITING_NAME = "SET_EDITING_NAME",
	SET_EDITING_EMAIL = "SET_EDITING_EMAIL",
	SET_EDITING_PASSWORD = "SET_EDITING_PASSWORD",
	SET_EDITING_IS_ADMIN = "SET_EDITING_IS_ADMIN",
	SET_UPLOADING_AVATAR_USER_ID = "SET_UPLOADING_AVATAR_USER_ID",
	SET_RESETTING_VERIFICATION_USER_ID = "SET_RESETTING_VERIFICATION_USER_ID",
	SET_CONFIRMING_DELETE_USER_ID = "SET_CONFIRMING_DELETE_USER_ID",
	SET_DELETING_USER_ID = "SET_DELETING_USER_ID",
}

interface UsersPageState {
	users: UserRecord[];
	loading: boolean;
	error: string | null;
	username: string;
	name: string;
	email: string;
	password: string;
	isAdmin: boolean;
	editingUserId: string | null;
	editingUsername: string;
	editingName: string;
	editingEmail: string;
	editingPassword: string;
	editingIsAdmin: boolean;
	uploadingAvatarUserId: string | null;
	resettingVerificationUserId: string | null;
	confirmingDeleteUserId: string | null;
	deletingUserId: string | null;
}

const initialState: UsersPageState = {
	users: [],
	loading: true,
	error: null,
	username: "",
	name: "",
	email: "",
	password: "",
	isAdmin: true,
	editingUserId: null,
	editingUsername: "",
	editingName: "",
	editingEmail: "",
	editingPassword: "",
	editingIsAdmin: true,
	uploadingAvatarUserId: null,
	resettingVerificationUserId: null,
	confirmingDeleteUserId: null,
	deletingUserId: null,
};

function reducer(
	state: UsersPageState = initialState,
	action: ReducerAction<UsersPageActionType>
): UsersPageState {
	switch (action.type) {
		case UsersPageActionType.SET_USERS:
			return { ...state, users: (action.data as UserRecord[]) ?? [] };
		case UsersPageActionType.SET_LOADING:
			return { ...state, loading: (action.data as boolean | undefined) ?? false };
		case UsersPageActionType.SET_ERROR:
			return { ...state, error: (action.data as string | null) ?? null };
		case UsersPageActionType.SET_USERNAME:
			return { ...state, username: (action.data as string) ?? "" };
		case UsersPageActionType.SET_NAME:
			return { ...state, name: (action.data as string) ?? "" };
		case UsersPageActionType.SET_EMAIL:
			return { ...state, email: (action.data as string) ?? "" };
		case UsersPageActionType.SET_PASSWORD:
			return { ...state, password: (action.data as string) ?? "" };
		case UsersPageActionType.SET_IS_ADMIN:
			return { ...state, isAdmin: (action.data as boolean | undefined) ?? false };
		case UsersPageActionType.SET_EDITING_USER_ID:
			return { ...state, editingUserId: (action.data as string | null) ?? null };
		case UsersPageActionType.SET_EDITING_USERNAME:
			return { ...state, editingUsername: (action.data as string) ?? "" };
		case UsersPageActionType.SET_EDITING_NAME:
			return { ...state, editingName: (action.data as string) ?? "" };
		case UsersPageActionType.SET_EDITING_EMAIL:
			return { ...state, editingEmail: (action.data as string) ?? "" };
		case UsersPageActionType.SET_EDITING_PASSWORD:
			return { ...state, editingPassword: (action.data as string) ?? "" };
		case UsersPageActionType.SET_EDITING_IS_ADMIN:
			return { ...state, editingIsAdmin: (action.data as boolean | undefined) ?? false };
		case UsersPageActionType.SET_UPLOADING_AVATAR_USER_ID:
			return { ...state, uploadingAvatarUserId: (action.data as string | null) ?? null };
		case UsersPageActionType.SET_RESETTING_VERIFICATION_USER_ID:
			return { ...state, resettingVerificationUserId: (action.data as string | null) ?? null };
		case UsersPageActionType.SET_CONFIRMING_DELETE_USER_ID:
			return { ...state, confirmingDeleteUserId: (action.data as string | null) ?? null };
		case UsersPageActionType.SET_DELETING_USER_ID:
			return { ...state, deletingUserId: (action.data as string | null) ?? null };
		default:
			return state;
	}
}

const { Provider: UsersPageStateProvider, useContextAccessors: useUsersPageState } =
	bootstrapProvider<UsersPageState, ReducerAction<UsersPageActionType>>(
		reducer,
		initialState
	);

export default function UsersPage() {
	return (
		<UsersPageStateProvider>
			<UsersPageContent />
		</UsersPageStateProvider>
	);
}

function UsersPageContent() {
	const { state, dispatch } = useUsersPageState();
	const {
		users,
		loading,
		error,
		username,
		name,
		email,
		password,
		isAdmin,
		editingUserId,
		editingUsername,
		editingName,
		editingEmail,
		editingPassword,
		editingIsAdmin,
		uploadingAvatarUserId,
		resettingVerificationUserId,
		confirmingDeleteUserId,
		deletingUserId,
	} = state;

	const load = async () => {
		dispatch({ type: UsersPageActionType.SET_LOADING, data: true });
		try {
			const items = await listUsers();
			dispatch({ type: UsersPageActionType.SET_USERS, data: items });
		} catch (err) {
			dispatch({
				type: UsersPageActionType.SET_ERROR,
				data: err instanceof Error ? err.message : "Failed to load users",
			});
		} finally {
			dispatch({ type: UsersPageActionType.SET_LOADING, data: false });
		}
	};

	useEffect(() => {
		load();
	}, [dispatch]);

	const handleCreate = async (e: React.FormEvent) => {
		e.preventDefault();
		dispatch({ type: UsersPageActionType.SET_ERROR, data: null });
		try {
			await createUser(username, password, isAdmin, name, email);
			dispatch({ type: UsersPageActionType.SET_USERNAME, data: "" });
			dispatch({ type: UsersPageActionType.SET_NAME, data: "" });
			dispatch({ type: UsersPageActionType.SET_EMAIL, data: "" });
			dispatch({ type: UsersPageActionType.SET_PASSWORD, data: "" });
			dispatch({ type: UsersPageActionType.SET_IS_ADMIN, data: true });
			await load();
		} catch (err) {
			dispatch({
				type: UsersPageActionType.SET_ERROR,
				data: err instanceof Error ? err.message : "Failed to create user",
			});
		}
	};

	const startEdit = (user: UserRecord) => {
		dispatch({ type: UsersPageActionType.SET_EDITING_USER_ID, data: user.id });
		dispatch({ type: UsersPageActionType.SET_EDITING_USERNAME, data: user.username });
		dispatch({ type: UsersPageActionType.SET_EDITING_NAME, data: user.name ?? "" });
		dispatch({ type: UsersPageActionType.SET_EDITING_EMAIL, data: user.email ?? "" });
		dispatch({ type: UsersPageActionType.SET_EDITING_PASSWORD, data: "" });
		dispatch({ type: UsersPageActionType.SET_EDITING_IS_ADMIN, data: user.isAdmin });
	};

	const handleUpdate = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!editingUserId) return;
		dispatch({ type: UsersPageActionType.SET_ERROR, data: null });
		try {
			await updateUser(editingUserId, {
				username: editingUsername,
				name: editingName,
				email: editingEmail,
				password: editingPassword,
				isAdmin: editingIsAdmin,
			});
			dispatch({ type: UsersPageActionType.SET_EDITING_USER_ID, data: null });
			dispatch({ type: UsersPageActionType.SET_EDITING_USERNAME, data: "" });
			dispatch({ type: UsersPageActionType.SET_EDITING_NAME, data: "" });
			dispatch({ type: UsersPageActionType.SET_EDITING_EMAIL, data: "" });
			dispatch({ type: UsersPageActionType.SET_EDITING_PASSWORD, data: "" });
			await load();
		} catch (err) {
			dispatch({
				type: UsersPageActionType.SET_ERROR,
				data: err instanceof Error ? err.message : "Failed to update user",
			});
		}
	};

	const requestDelete = (user: UserRecord) => {
		dispatch({ type: UsersPageActionType.SET_ERROR, data: null });
		dispatch({ type: UsersPageActionType.SET_CONFIRMING_DELETE_USER_ID, data: user.id });
	};

	const cancelDelete = () => {
		dispatch({ type: UsersPageActionType.SET_CONFIRMING_DELETE_USER_ID, data: null });
	};

	const confirmDelete = async (user: UserRecord) => {
		dispatch({ type: UsersPageActionType.SET_ERROR, data: null });
		dispatch({ type: UsersPageActionType.SET_DELETING_USER_ID, data: user.id });
		try {
			await deleteUser(user.id);
			dispatch({ type: UsersPageActionType.SET_CONFIRMING_DELETE_USER_ID, data: null });
			await load();
		} catch (err) {
			dispatch({
				type: UsersPageActionType.SET_ERROR,
				data: err instanceof Error ? err.message : "Failed to delete user",
			});
		} finally {
			dispatch({ type: UsersPageActionType.SET_DELETING_USER_ID, data: null });
		}
	};

	const handleAvatarUpload = async (userId: string, file: File) => {
		dispatch({ type: UsersPageActionType.SET_ERROR, data: null });
		dispatch({ type: UsersPageActionType.SET_UPLOADING_AVATAR_USER_ID, data: userId });
		try {
			const formData = new FormData();
			formData.set("userId", userId);
			formData.set("file", file);
			const response = await fetch("/api/users/avatar", {
				method: "POST",
				body: formData,
			});
			if (!response.ok) {
				const payload = (await response.json().catch(() => null)) as
					| { error_description?: string; error?: string }
					| null;
				throw new Error(payload?.error_description ?? payload?.error ?? "Failed to upload avatar");
			}
			await load();
		} catch (err) {
			dispatch({
				type: UsersPageActionType.SET_ERROR,
				data: err instanceof Error ? err.message : "Failed to upload avatar",
			});
		} finally {
			dispatch({ type: UsersPageActionType.SET_UPLOADING_AVATAR_USER_ID, data: null });
		}
	};

	const handleResetVerification = async (user: UserRecord) => {
		dispatch({ type: UsersPageActionType.SET_ERROR, data: null });
		dispatch({ type: UsersPageActionType.SET_RESETTING_VERIFICATION_USER_ID, data: user.id });
		try {
			await updateUser(user.id, { emailVerifiedAt: null });
			await load();
		} catch (err) {
			dispatch({
				type: UsersPageActionType.SET_ERROR,
				data: err instanceof Error ? err.message : "Failed to reset email verification",
			});
		} finally {
			dispatch({ type: UsersPageActionType.SET_RESETTING_VERIFICATION_USER_ID, data: null });
		}
	};

	if (loading) {
		return <FullPageSpinner />;
	}

	return (
		<main className="min-h-screen bg-background p-6 text-foreground">
			<div className="flex items-center gap-2 text-xl font-semibold">
				<Users className="h-6 w-6" />
				Users
			</div>

			<div className="mt-8 grid gap-8">
				<CreateUserForm
					username={username}
					onUsernameChange={(value) =>
						dispatch({ type: UsersPageActionType.SET_USERNAME, data: value })
					}
					name={name}
					onNameChange={(value) =>
						dispatch({ type: UsersPageActionType.SET_NAME, data: value })
					}
					email={email}
					onEmailChange={(value) =>
						dispatch({ type: UsersPageActionType.SET_EMAIL, data: value })
					}
					password={password}
					onPasswordChange={(value) =>
						dispatch({ type: UsersPageActionType.SET_PASSWORD, data: value })
					}
					isAdmin={isAdmin}
					onIsAdminChange={(value) =>
						dispatch({ type: UsersPageActionType.SET_IS_ADMIN, data: value })
					}
					error={error}
					onSubmit={handleCreate}
				/>

				<UsersSection
					users={users}
					editingUserId={editingUserId}
					editingUsername={editingUsername}
					onEditingUsernameChange={(value) =>
						dispatch({ type: UsersPageActionType.SET_EDITING_USERNAME, data: value })
					}
					editingName={editingName}
					onEditingNameChange={(value) =>
						dispatch({ type: UsersPageActionType.SET_EDITING_NAME, data: value })
					}
					editingEmail={editingEmail}
					onEditingEmailChange={(value) =>
						dispatch({ type: UsersPageActionType.SET_EDITING_EMAIL, data: value })
					}
					editingPassword={editingPassword}
					onEditingPasswordChange={(value) =>
						dispatch({ type: UsersPageActionType.SET_EDITING_PASSWORD, data: value })
					}
					editingIsAdmin={editingIsAdmin}
					onEditingIsAdminChange={(value) =>
						dispatch({ type: UsersPageActionType.SET_EDITING_IS_ADMIN, data: value })
					}
					onUpdate={handleUpdate}
					onCancelEdit={() =>
						dispatch({ type: UsersPageActionType.SET_EDITING_USER_ID, data: null })
					}
					onStartEdit={startEdit}
					uploadingAvatarUserId={uploadingAvatarUserId}
					onAvatarUpload={(userId, file) => void handleAvatarUpload(userId, file)}
					resettingVerificationUserId={resettingVerificationUserId}
					onResetVerification={handleResetVerification}
					confirmingDeleteUserId={confirmingDeleteUserId}
					deletingUserId={deletingUserId}
					onRequestDelete={requestDelete}
					onConfirmDelete={confirmDelete}
					onCancelDelete={cancelDelete}
				/>
			</div>
		</main>
	);
}
