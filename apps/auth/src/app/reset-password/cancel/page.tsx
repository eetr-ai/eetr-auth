import Link from "next/link";
import { getPublicSiteSettings } from "@/lib/public-site-settings";
import { CancelPasswordResetClient } from "@/app/reset-password/cancel/cancel-password-reset-client";

export const dynamic = "force-dynamic";

export default async function CancelPasswordResetPage({
	searchParams,
}: {
	searchParams: Promise<{ token?: string }>;
}) {
	const site = await getPublicSiteSettings();
	const { token } = await searchParams;
	const trimmed = token?.trim();

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
					<p className="text-center text-sm text-muted-foreground">Cancel password reset</p>
				</div>
				{trimmed ? (
					<CancelPasswordResetClient token={trimmed} />
				) : (
					<p className="rounded-xl bg-red-950/50 px-3 py-2 text-sm text-red-200">
						Missing reset link. Open the cancel link from your email, or request a new reset from
						forgot password.
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
