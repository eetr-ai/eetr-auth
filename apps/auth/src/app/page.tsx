import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signOut, auth } from "@/auth";
import { getPublicSiteSettings } from "@/lib/public-site-settings";
import { SignInForm } from "@/app/sign-in-form";
import { ThemeSwitcher } from "@/app/theme-switcher";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
	const settings = await getPublicSiteSettings();
	return {
		title: settings.displayTitle,
		description: `Sign in to ${settings.displayTitle}`,
	};
}

export default async function HomePage({
	searchParams,
}: {
	searchParams: Promise<{ error?: string; callbackUrl?: string; reset?: string }>;
}) {
	const [session, site, { error, callbackUrl, reset }] = await Promise.all([
		auth(),
		getPublicSiteSettings(),
		searchParams,
	]);
	const { displayTitle, displayLogoUrl, siteUrl, mfaEnabled } = site;
	const normalizedCallbackUrl = callbackUrl?.trim() ?? "";
	const callbackTargetsAdmin =
		normalizedCallbackUrl.startsWith("/dashboard") || normalizedCallbackUrl.startsWith("/admin");

	if (session?.user?.id) {
		if (normalizedCallbackUrl.length > 0 && !callbackTargetsAdmin) {
			redirect(normalizedCallbackUrl);
		}
		if (session.user.isAdmin) {
			redirect("/dashboard");
		}
	}

	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-foreground">
			<div className="fixed right-4 top-4">
				<ThemeSwitcher />
			</div>
			<div className="w-full max-w-sm space-y-8 rounded-card border border-border bg-background p-8">
				<div className="flex flex-col items-center gap-3">
					{/* eslint-disable-next-line @next/next/no-img-element -- CDN or /public paths from site settings */}
					<img
						src={displayLogoUrl}
						alt=""
						width={120}
						height={120}
						className="h-[120px] w-[120px] rounded-card object-contain"
					/>
					<div className="text-center">
						<h1 className="text-2xl font-semibold text-foreground">{displayTitle}</h1>
						<p className="mt-1 text-sm text-muted-foreground">Sign in</p>
					</div>
					{siteUrl ? (
						<a
							href={siteUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="text-xs text-muted-foreground underline hover:text-foreground"
						>
							{siteUrl.replace(/^https?:\/\//, "")}
						</a>
					) : null}
				</div>
				{error === "CredentialsSignin" && (
					<p className="rounded-card bg-danger-bg px-3 py-2 text-sm text-danger-fg">
						Invalid username or password.
					</p>
				)}
				{error === "AuthError" && (
					<p className="rounded-card bg-danger-bg px-3 py-2 text-sm text-danger-fg">
						Something went wrong. Please try again.
					</p>
				)}
				{reset === "success" && (
					<p className="rounded-card bg-success-bg px-3 py-2 text-sm text-success-fg">
						Your password was updated. You can sign in below.
					</p>
				)}
				{session?.user?.id ? (
					<div className="space-y-4">
						<p className="rounded-card bg-surface-sunken px-3 py-2 text-sm">
							Signed in as <strong>{session.user.name ?? session.user.id}</strong>. This account
							does not have admin dashboard access.
						</p>
						<form
							action={async () => {
								"use server";
								await signOut({ redirectTo: "/" });
							}}
						>
							<button
								type="submit"
								className="w-full rounded-full border border-border px-4 py-2 font-medium text-foreground hover:bg-surface-hover"
							>
								Sign out
							</button>
						</form>
					</div>
				) : (
					<SignInForm
						mfaEnabled={mfaEnabled}
						callbackUrl={
							callbackUrl && callbackUrl.trim().length > 0 ? callbackUrl : "/"
						}
					/>
				)}
			</div>
		</div>
	);
}
