import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signOut, auth } from "@/auth";
import { getPublicSiteSettings } from "@/lib/public-site-settings";
import { SignInForm } from "@/app/sign-in-form";
import { TestUserPicker } from "@/app/_components/test-user-picker";
import { ThemeSwitcher } from "@/app/theme-switcher";
import { buildRequestContext } from "@/lib/context/build-context";
import { getServices } from "@/lib/services/registry";
import { resolvePendingClient } from "@/lib/auth/pending-client";

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

	// Which client is authorizing lives only in the signed `oauth_pending` cookie — this
	// page is reached by redirect, so there is nothing in the URL to read. A test client
	// gets the one-click picker instead of the password form. Same lookup the consent page
	// does; null simply means "no OAuth request in flight", i.e. a plain dashboard login.
	const normalizedCallbackUrl = callbackUrl?.trim() ?? "";
	const ctx = await buildRequestContext();
	const services = getServices(ctx);
	const pendingClient = await resolvePendingClient(
		services.clientService,
		ctx.env as unknown as Record<string, unknown>
	);
	// The cookie outlives the request that set it (300s) and is not scoped to this page, so
	// its presence alone does not mean an authorization is in flight. Only a sign-in that
	// /api/authorize itself redirected here — callbackUrl=/oauth/confirm — counts; otherwise
	// a plain visit to the sign-in page, minutes after poking at a test client, would be
	// handed the one-click picker and no password form at all.
	const isOAuthSignIn = normalizedCallbackUrl === "/oauth/confirm";
	const isTestSignIn = isOAuthSignIn && pendingClient?.isTest === true;
	const testUsers = isTestSignIn
		? await services.userService.listTestUsersForEnvironment(pendingClient!.environmentId)
		: [];
	// The cookie lives 300s. When it lapses mid-flow the callbackUrl still points at the
	// confirm step, so falling back to the password form would silently offer the wrong
	// thing on a test client — and on any client it would strand the user in a flow whose
	// request no longer exists. Say so instead.
	const pendingExpired = !pendingClient && isOAuthSignIn;
	const { displayTitle, displayLogoUrl, siteUrl, mfaEnabled } = site;
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
				) : pendingExpired ? (
					<p className="rounded-card bg-warning-bg px-3 py-2 text-sm text-warning-fg">
						This sign-in request expired. Return to the application and start again.
					</p>
				) : isTestSignIn ? (
					<TestUserPicker
						users={testUsers}
						clientName={pendingClient!.name?.trim() || pendingClient!.clientId}
						callbackUrl={
							callbackUrl && callbackUrl.trim().length > 0 ? callbackUrl : "/oauth/confirm"
						}
					/>
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
