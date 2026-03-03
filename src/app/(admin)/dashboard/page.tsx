"use client";

import { useEffect, useState } from "react";
import { LayoutDashboard, User as UserIcon } from "lucide-react";
import { useAdminState, AdminActionType } from "@/context/admin-state";
import { getCurrentUser } from "@/app/actions/user-actions";
import type { User } from "@/lib/repositories/user.repository";

export default function AdminDashboardPage() {
	const { state, dispatch } = useAdminState();
	const [user, setUser] = useState<User | null>(null);

	useEffect(() => {
		dispatch({ type: AdminActionType.SET_LOADING, data: true });
		getCurrentUser()
			.then(setUser)
			.finally(() => dispatch({ type: AdminActionType.SET_LOADING, data: false }));
	}, [dispatch]);

	return (
		<main className="min-h-screen p-6">
			<div className="flex items-center gap-2 text-xl font-semibold">
				<LayoutDashboard className="h-6 w-6" />
				Admin Dashboard
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
						<span>{user.email}</span>
					</div>
				) : (
					<p className="text-muted-foreground">No current user (auth not configured)</p>
				)}
			</div>
		</main>
	);
}
