import Link from "next/link";
import { AdminProvider } from "@/context/admin-state";
import { AdminNav } from "@/app/(admin)/admin-nav";

export default function AdminLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<AdminProvider>
			<div className="flex min-h-screen bg-background text-foreground">
				<AdminNav />
				<div className="flex-1">{children}</div>
			</div>
		</AdminProvider>
	);
}
