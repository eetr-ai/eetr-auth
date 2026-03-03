"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Settings, KeyRound, LogOut } from "lucide-react";
import { logout } from "@/app/actions/user-actions";

const navItems = [
	{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
	{ href: "/dashboard/setup", label: "Setup", icon: Settings },
	{ href: "/dashboard/clients", label: "Clients", icon: KeyRound },
];

export function AdminNav() {
	const pathname = usePathname();

	return (
		<aside className="flex w-56 flex-col border-r border-brand-muted bg-background">
			<nav className="flex flex-1 flex-col gap-1 p-4">
				{navItems.map(({ href, label, icon: Icon }) => {
					const isActive = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
					return (
						<Link
							key={href}
							href={href}
							className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
								isActive
									? "bg-brand-muted/50 text-foreground"
									: "text-muted-foreground hover:bg-brand-muted/30 hover:text-foreground"
							}`}
						>
							<Icon className="h-4 w-4" />
							{label}
						</Link>
					);
				})}
			</nav>
			<div className="border-t border-brand-muted p-4">
				<form action={logout}>
					<button
						type="submit"
						className="flex w-full items-center gap-2 rounded-full border border-brand-muted px-3 py-2 text-sm font-medium text-foreground hover:bg-brand-muted/30"
					>
						<LogOut className="h-4 w-4" />
						Sign out
					</button>
				</form>
			</div>
		</aside>
	);
}
