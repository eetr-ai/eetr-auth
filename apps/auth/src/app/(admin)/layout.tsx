import { AdminProvider } from "@/context/admin-state";
import { AdminNav } from "@/app/(admin)/admin-nav";
import { getSiteSettings } from "@/app/actions/site-settings-actions";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const settings = await getSiteSettings();

	return (
		<AdminProvider>
			<div className="flex min-h-screen bg-background text-foreground">
				<AdminNav displayTitle={settings.displayTitle} displayLogoUrl={settings.displayLogoUrl} />
				<div className="flex-1">{children}</div>
			</div>
		</AdminProvider>
	);
}
