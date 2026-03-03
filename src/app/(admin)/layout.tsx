import { AdminProvider } from "@/context/admin-state";

export default function AdminLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return <AdminProvider>{children}</AdminProvider>;
}
