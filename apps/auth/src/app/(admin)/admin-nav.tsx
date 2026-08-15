"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
	LayoutDashboard,
	Settings,
	KeyRound,
	Fingerprint,
	Users,
	LogOut,
	ListTodo,
	ClipboardList,
} from "lucide-react";
import { logout } from "@/app/actions/user-actions";
import { ThemeSwitcher } from "@/app/theme-switcher";

const navItems = [
	{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
	{ href: "/dashboard/setup", label: "Setup", icon: Settings },
	{ href: "/dashboard/users", label: "Users", icon: Users },
	{ href: "/dashboard/clients", label: "Clients", icon: KeyRound },
	{ href: "/dashboard/tokens", label: "Tokens", icon: Fingerprint },
	{ href: "/dashboard/logs", label: "Logs", icon: ListTodo },
	{ href: "/dashboard/audit-log", label: "Audit log", icon: ClipboardList },
];

export function AdminNav({
	displayTitle,
	displayLogoUrl,
}: {
	displayTitle: string;
	displayLogoUrl: string;
}) {
	const pathname = usePathname();

	return (
		<aside className="sticky top-0 flex h-screen max-h-dvh w-56 shrink-0 flex-col self-start overflow-hidden border-r border-border bg-background">
			<div className="shrink-0 border-b border-border p-4">
				<Link href="/dashboard" className="flex items-center gap-3 rounded-card outline-none ring-brand focus-visible:ring-2">
					{/* eslint-disable-next-line @next/next/no-img-element -- dynamic CDN or local paths */}
					<img
						src={displayLogoUrl}
						alt=""
						className="h-9 w-9 shrink-0 object-contain"
						width={36}
						height={36}
					/>
					<span className="truncate font-semibold text-foreground">{displayTitle}</span>
				</Link>
			</div>
			<nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-4">
				{navItems.map(({ href, label, icon: Icon }) => {
					const isActive =
						pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
					return (
						<Link
							key={href}
							href={href}
							className={`flex items-center gap-2 rounded-card px-3 py-2 text-sm font-medium transition-colors ${
								isActive
									? "bg-surface-sunken text-foreground"
									: "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
							}`}
						>
							<Icon className="h-4 w-4" />
							{label}
						</Link>
					);
				})}
			</nav>
			<div className="shrink-0 border-t border-border p-4 space-y-2">
				<div className="flex justify-center pb-1">
					<ThemeSwitcher />
				</div>
				{(() => {
					const href = "/dashboard/settings";
					const isActive = pathname === href || pathname.startsWith(href);
					return (
						<Link
							href={href}
							className={`flex items-center gap-2 rounded-card px-3 py-2 text-sm font-medium transition-colors ${
								isActive
									? "bg-surface-sunken text-foreground"
									: "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
							}`}
						>
							<Settings className="h-4 w-4" />
							Settings
						</Link>
					);
				})()}
				<form action={logout}>
					<button
						type="submit"
						className="flex w-full items-center gap-2 rounded-full border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-hover"
					>
						<LogOut className="h-4 w-4" />
						Sign out
					</button>
				</form>
			</div>
		</aside>
	);
}
