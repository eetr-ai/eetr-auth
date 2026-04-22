import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { auth, signOut } from "@/auth";
import {
	decodePendingAuthorizationCookie,
	getPendingCookieName,
} from "@/lib/auth/oauth-pending-cookie";
import PasskeyPrompt from "./passkey-prompt";

export default async function OAuthConfirmPage() {
	const session = await auth();
	const cookieStore = await cookies();
	const { env } = await getCloudflareContext({ async: true });
	const pendingParams = await decodePendingAuthorizationCookie(
		cookieStore.get(getPendingCookieName())?.value,
		env as unknown as Record<string, unknown>
	);
	const hasPkce =
		typeof pendingParams?.code_challenge === "string" &&
		pendingParams.code_challenge.length > 0 &&
		typeof pendingParams?.code_challenge_method === "string" &&
		pendingParams.code_challenge_method.length > 0;

	if (!pendingParams || !hasPkce) {
		redirect("/?error=oauth_confirm_missing_pkce");
	}

	if (!session?.user?.id) {
		redirect(`/?callbackUrl=${encodeURIComponent("/oauth/confirm")}`);
	}

	const displayName = session.user.name ?? session.user.email ?? session.user.id;

	return (
		<main className="min-h-screen bg-background p-6 text-foreground">
			<div className="mx-auto mt-16 w-full max-w-xl rounded-xl border border-brand-muted bg-background p-8">
				<h1 className="text-2xl font-semibold">Confirm OAuth account</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					Choose which account should authorize this application.
				</p>
				<div className="mt-6 flex items-center gap-4 rounded-xl border border-brand-muted p-4">
					{session.user.image ? (
						<div
							aria-label={displayName}
							className="h-12 w-12 rounded-full bg-cover bg-center"
							style={{ backgroundImage: `url("${session.user.image}")` }}
						/>
					) : (
						<div className="flex h-12 w-12 items-center justify-center rounded-full border border-brand-muted text-sm font-semibold">
							{displayName.slice(0, 2).toUpperCase()}
						</div>
					)}
					<div className="flex flex-col">
						<span className="font-medium">{displayName}</span>
						{session.user.email && (
							<span className="text-sm text-muted-foreground">{session.user.email}</span>
						)}
					</div>
				</div>

				<PasskeyPrompt />

				<a
					href="/api/authorize/complete"
					className="mt-6 block w-full rounded-full bg-brand px-4 py-2 text-center font-medium text-white hover:bg-brand-muted"
				>
					Continue as {displayName}
				</a>

				<form
					action={async () => {
						"use server";
						await signOut({
							redirectTo: `/?callbackUrl=${encodeURIComponent("/oauth/confirm")}`,
						});
					}}
					className="mt-3"
				>
					<button
						type="submit"
						className="w-full rounded-full border border-brand-muted px-4 py-2 font-medium hover:bg-brand-muted/30"
					>
						Sign in with a different account
					</button>
				</form>
			</div>
		</main>
	);
}
