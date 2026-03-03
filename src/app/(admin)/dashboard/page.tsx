"use client";

import { useEffect, useState } from "react";
import { LayoutDashboard, User as UserIcon, LogOut } from "lucide-react";
import { useAdminState, AdminActionType } from "@/context/admin-state";
import { getCurrentUser, logout } from "@/app/actions/user-actions";
import type { Session } from "next-auth";

export default function AdminDashboardPage() {
	const { state, dispatch } = useAdminState();
	const [user, setUser] = useState<Session["user"] | null>(null);

	useEffect(() => {
		dispatch({ type: AdminActionType.SET_LOADING, data: true });
		getCurrentUser()
			.then(setUser)
			.finally(() => dispatch({ type: AdminActionType.SET_LOADING, data: false }));
	}, [dispatch]);

	return (
		<main className="min-h-screen p-6 bg-background text-foreground">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2 text-xl font-semibold">
					<LayoutDashboard className="h-6 w-6" />
					Admin Dashboard
				</div>
				{user && (
					<form action={logout}>
						<button
							type="submit"
							className="flex items-center gap-2 rounded-md border border-brand-muted px-3 py-2 text-sm font-medium text-foreground hover:bg-brand-muted/30"
						>
							<LogOut className="h-4 w-4" />
							Sign out
						</button>
					</form>
				)}
			</div>
			<div className="mt-6 flex flex-col gap-4">
				<p className="text-muted-foreground">
					Sidebar open: {state.sidebarOpen ? "Yes" : "No"}
				</p>
				{state.loading ? (
					<p>Loading...</p>
				) : user ? (
					<div className="flex items-center gap-2">
						<UserIcon className="h-4 w-4" />
						<span>{user.name ?? user.id}</span>
					</div>
				) : (
					<p className="text-muted-foreground">No current user</p>
				)}
			</div>
		</main>
	);
}
