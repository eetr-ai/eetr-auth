import Link from "next/link";
import { getPublicSiteSettings } from "@/lib/public-site-settings";
import { ResetPasswordForm } from "@/app/reset-password/reset-password-form";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
	searchParams,
}: {
	searchParams: Promise<{ token?: string }>;
}) {
	const site = await getPublicSiteSettings();
	const { token } = await searchParams;

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
					<p className="text-center text-sm text-muted-foreground">Choose a new password.</p>
				</div>
				{token?.trim() ? (
					<ResetPasswordForm token={token.trim()} />
				) : (
					<p className="rounded-xl bg-red-950/50 px-3 py-2 text-sm text-red-200">
						Missing or invalid reset link. Request a new link from the forgot password page.
					</p>
				)}
				<p className="text-center text-sm">
					<Link href="/" className="text-muted-foreground underline hover:text-foreground">
						Back to sign in
					</Link>
				</p>
			</div>
		</div>
	);
}
