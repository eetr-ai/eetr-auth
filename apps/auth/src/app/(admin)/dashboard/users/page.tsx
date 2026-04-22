"use client";

import { ReducerAction, bootstrapProvider } from "@eetr/react-reducer-utils";
import { useEffect } from "react";
import { Users, Plus, Pencil, Trash2, Loader2, BadgeCheck, BadgeX, RotateCcw } from "lucide-react";
import {
	createUser,
	deleteUser,
	listUsers,
	updateUser,
} from "@/app/actions/user-actions";
import type { UserRecord } from "@/lib/repositories/admin.repository";

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

	const handleDelete = async (user: UserRecord) => {
		const label = user.username || user.email || user.id;
		if (!confirm(`Delete user ${label}? This cannot be undone.`)) return;
		dispatch({ type: UsersPageActionType.SET_ERROR, data: null });
		try {
			await deleteUser(user.id);
			await load();
		} catch (err) {
			dispatch({
				type: UsersPageActionType.SET_ERROR,
				data: err instanceof Error ? err.message : "Failed to delete user",
			});
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

	const renderVerificationStatus = (user: UserRecord) => {
		if (!user.email?.trim()) {
			return <span className="text-xs text-muted-foreground">No email</span>;
		}
		if (user.emailVerifiedAt) {
			return (
				<span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/50 px-2 py-0.5 text-xs text-emerald-200">
					<BadgeCheck className="h-3.5 w-3.5" />
					Verified
				</span>
			);
		}
		return (
			<span className="inline-flex items-center gap-1 rounded-full bg-amber-950/50 px-2 py-0.5 text-xs text-amber-200">
				<BadgeX className="h-3.5 w-3.5" />
				Unverified
			</span>
		);
	};

	if (loading) {
		return (
			<main className="flex min-h-screen items-center justify-center p-6">
				<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
			</main>
		);
	}

	return (
		<main className="min-h-screen bg-background p-6 text-foreground">
			<div className="flex items-center gap-2 text-xl font-semibold">
				<Users className="h-6 w-6" />
				Users
			</div>

			<div className="mt-8 grid gap-8">
				<section className="rounded-xl border border-brand-muted p-6">
					<h2 className="mb-4 text-lg font-medium">Create user</h2>
					{error && (
						<p className="mb-3 rounded-xl bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</p>
					)}
					<form onSubmit={handleCreate} className="grid gap-3 md:grid-cols-6">
						<input
							type="text"
							value={username}
							onChange={(e) =>
								dispatch({ type: UsersPageActionType.SET_USERNAME, data: e.target.value })
							}
							placeholder="Username"
							className="rounded-xl border border-brand-muted bg-background px-3 py-2 text-foreground placeholder:text-foreground/50 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
						/>
						<input
							type="text"
							value={name}
							onChange={(e) =>
								dispatch({ type: UsersPageActionType.SET_NAME, data: e.target.value })
							}
							placeholder="Display name (optional)"
							className="rounded-xl border border-brand-muted bg-background px-3 py-2 text-foreground placeholder:text-foreground/50 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
						/>
						<input
							type="email"
							value={email}
							onChange={(e) =>
								dispatch({ type: UsersPageActionType.SET_EMAIL, data: e.target.value })
							}
							placeholder="Email (optional)"
							className="rounded-xl border border-brand-muted bg-background px-3 py-2 text-foreground placeholder:text-foreground/50 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
						/>
						<input
							type="password"
							value={password}
							onChange={(e) =>
								dispatch({ type: UsersPageActionType.SET_PASSWORD, data: e.target.value })
							}
							placeholder="Password"
							className="rounded-xl border border-brand-muted bg-background px-3 py-2 text-foreground placeholder:text-foreground/50 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
						/>
						<label className="flex items-center gap-2 rounded-xl border border-brand-muted px-3 py-2 text-sm">
							<input
								type="checkbox"
								checked={isAdmin}
								onChange={(e) =>
									dispatch({ type: UsersPageActionType.SET_IS_ADMIN, data: e.target.checked })
								}
							/>
							Is admin
						</label>
						<button
							type="submit"
							className="flex items-center justify-center gap-1 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-muted"
						>
							<Plus className="h-4 w-4" />
							Create
						</button>
					</form>
				</section>

				<section className="rounded-xl border border-brand-muted p-6">
					<h2 className="mb-4 text-lg font-medium">Manage users</h2>
					<ul className="space-y-2">
						{users.map((user) => (
							<li
								key={user.id}
								className="rounded-xl border border-brand-muted px-3 py-2"
							>
								{editingUserId === user.id ? (
									<form onSubmit={handleUpdate} className="grid gap-2 md:grid-cols-7">
										<input
											type="text"
											value={editingUsername}
											onChange={(e) =>
												dispatch({
													type: UsersPageActionType.SET_EDITING_USERNAME,
													data: e.target.value,
												})
											}
											className="rounded-xl border border-brand-muted bg-background px-2 py-1 text-sm focus:border-brand focus:outline-none"
										/>
										<input
											type="text"
											value={editingName}
											onChange={(e) =>
												dispatch({
													type: UsersPageActionType.SET_EDITING_NAME,
													data: e.target.value,
												})
											}
											placeholder="Display name"
											className="rounded-xl border border-brand-muted bg-background px-2 py-1 text-sm focus:border-brand focus:outline-none"
										/>
										<input
											type="email"
											value={editingEmail}
											onChange={(e) =>
												dispatch({
													type: UsersPageActionType.SET_EDITING_EMAIL,
													data: e.target.value,
												})
											}
											placeholder="Email"
											className="rounded-xl border border-brand-muted bg-background px-2 py-1 text-sm focus:border-brand focus:outline-none"
										/>
										<input
											type="password"
											value={editingPassword}
											onChange={(e) =>
												dispatch({
													type: UsersPageActionType.SET_EDITING_PASSWORD,
													data: e.target.value,
												})
											}
											placeholder="New password (optional)"
											className="rounded-xl border border-brand-muted bg-background px-2 py-1 text-sm focus:border-brand focus:outline-none"
										/>
										<label className="flex items-center gap-2 rounded-xl border border-brand-muted px-2 py-1 text-sm">
											<input
												type="checkbox"
												checked={editingIsAdmin}
												onChange={(e) =>
													dispatch({
														type: UsersPageActionType.SET_EDITING_IS_ADMIN,
														data: e.target.checked,
													})
												}
											/>
											Is admin
										</label>
										<button
											type="submit"
											className="rounded-full border border-brand-muted px-2 py-1 text-sm hover:bg-brand-muted/30"
										>
											Save
										</button>
										<button
											type="button"
											onClick={() =>
												dispatch({
													type: UsersPageActionType.SET_EDITING_USER_ID,
													data: null,
												})
											}
											className="rounded-full border border-brand-muted px-2 py-1 text-sm hover:bg-brand-muted/30"
										>
											Cancel
										</button>
									</form>
								) : (
									<div className="flex items-center justify-between">
										<div className="flex items-center gap-3">
											{user.avatarUrl ? (
												<div
													className="h-10 w-10 rounded-full bg-cover bg-center"
													style={{ backgroundImage: `url("${user.avatarUrl}")` }}
												/>
											) : (
												<div className="flex h-10 w-10 items-center justify-center rounded-full border border-brand-muted text-xs font-semibold">
													{(user.name ?? user.username).slice(0, 2).toUpperCase()}
												</div>
											)}
											<div className="flex flex-col">
											<span className="font-medium">{user.name ?? user.username}</span>
											<span className="text-xs text-muted-foreground">
												@{user.username}
											</span>
											{user.email && (
												<span className="text-xs text-muted-foreground">{user.email}</span>
											)}
											{renderVerificationStatus(user)}
											<span className="text-xs text-muted-foreground">
												{user.isAdmin ? "Admin" : "User"}
											</span>
											</div>
										</div>
										<div className="flex items-center gap-2">
											<label className="cursor-pointer rounded-full border border-brand-muted px-2 py-1 text-xs hover:bg-brand-muted/30">
												{uploadingAvatarUserId === user.id ? "Uploading..." : "Photo"}
												<input
													type="file"
													accept="image/jpeg,image/png,image/webp"
													disabled={uploadingAvatarUserId != null}
													className="hidden"
													onChange={(e) => {
														const file = e.target.files?.[0];
														if (file) {
															void handleAvatarUpload(user.id, file);
														}
														e.currentTarget.value = "";
													}}
												/>
											</label>
													{user.email?.trim() && user.emailVerifiedAt && !user.isAdmin ? (
														<button
															type="button"
															onClick={() => handleResetVerification(user)}
															disabled={resettingVerificationUserId === user.id}
															className="rounded-full border border-brand-muted px-2 py-1 text-xs hover:bg-brand-muted/30 disabled:opacity-50"
														>
															<span className="inline-flex items-center gap-1">
																<RotateCcw className="h-3.5 w-3.5" />
																{resettingVerificationUserId === user.id ? "Resetting..." : "Require re-verify"}
															</span>
														</button>
													) : null}
											<button
												type="button"
												onClick={() => startEdit(user)}
												className="rounded-full p-1.5 text-muted-foreground hover:bg-brand-muted/30 hover:text-foreground"
												aria-label="Edit user"
											>
												<Pencil className="h-4 w-4" />
											</button>
											<button
												type="button"
												onClick={() => handleDelete(user)}
												className="rounded-full p-1.5 text-muted-foreground hover:bg-red-950/50 hover:text-red-200"
												aria-label="Delete user"
											>
												<Trash2 className="h-4 w-4" />
											</button>
										</div>
									</div>
								)}
							</li>
						))}
						{users.length === 0 && (
							<li className="py-2 text-sm text-muted-foreground">No users found.</li>
						)}
					</ul>
				</section>
			</div>
		</main>
	);
}
