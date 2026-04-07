import Link from "next/link";
import { getPublicSiteSettings } from "@/lib/public-site-settings";
import { ForgotPasswordForm } from "./forgot-password-form";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
	const site = await getPublicSiteSettings();
	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-foreground">
			<div className="w-full max-w-sm space-y-8 rounded-xl border border-brand-muted bg-background p-8">
				<div className="flex flex-col items-center gap-3">
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img
						src={site.displayLogoUrl}
						alt=""
						width={120}
						height={120}
						className="h-[120px] w-[120px] rounded-xl object-contain"
					/>
					<h1 className="text-center text-2xl font-semibold">{site.displayTitle}</h1>
					<p className="text-center text-sm text-muted-foreground">
						Enter your account email. If it exists, we will send a reset link.
					</p>
				</div>
				<ForgotPasswordForm />
				<p className="text-center text-sm">
					<Link href="/" className="text-muted-foreground underline hover:text-foreground">
						Back to sign in
					</Link>
				</p>
			</div>
		</div>
	);
}
