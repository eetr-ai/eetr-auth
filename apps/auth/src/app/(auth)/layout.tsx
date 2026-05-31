import { ThemeSwitcher } from "@/app/theme-switcher";

export default function AuthLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center">
			<div className="fixed right-4 top-4">
				<ThemeSwitcher />
			</div>
			{children}
		</div>
	);
}
