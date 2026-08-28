import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth, signOut } from "@/auth";
import { buildRequestContext } from "@/lib/context/build-context";
import { getServices } from "@/lib/services/registry";
import {
	decodePendingAuthorizationCookie,
	getPendingCookieName,
} from "@/lib/auth/oauth-pending-cookie";
import PasskeyPrompt from "./passkey-prompt";

export default async function OAuthConfirmPage() {
	const session = await auth();
	const cookieStore = await cookies();
	const ctx = await buildRequestContext();
	const pendingParams = await decodePendingAuthorizationCookie(
		cookieStore.get(getPendingCookieName())?.value,
		ctx.env as unknown as Record<string, unknown>
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

	// Resolve the client's registered name for the consent prompt — important for
	// dynamically registered clients (e.g. "Claude", "ChatGPT") the user hasn't seen before.
	// The requested scopes and resource come straight from the pending request.
	const services = getServices(ctx);
	const client = pendingParams.client_id
		? await services.clientService.getByClientIdentifier(pendingParams.client_id)
		: null;
	const clientName = client?.name?.trim() || pendingParams.client_id || "An application";
	const requestedScopeNames = (pendingParams.scope ?? "")
		.split(/\s+/)
		.map((s) => s.trim())
		.filter(Boolean);

	// An authorize request with no `scope` means "everything this client is granted"
	// (see OauthAuthorizationService.authorize), so resolve the client's full grant set
	// rather than telling the user the uselessly vague "all scopes granted".
	const effectiveScopeNames = client
		? (
				await services.oauthAuthorizationService.resolveClientScopeGrants(
					client.id,
					requestedScopeNames
				)
			).map((grant) => grant.scopeName)
		: requestedScopeNames;

	// Consent copy is optional, so index what the catalog has and fall back to the raw
	// protocol token for anything an operator has not written copy for.
	const copyByName = new Map(
		(await services.scopeService.listByNames(effectiveScopeNames)).map((scope) => [
			scope.scopeName,
			scope,
		])
	);
	const consentScopes = effectiveScopeNames.map((name) => ({
		name,
		label: copyByName.get(name)?.displayName ?? null,
		description: copyByName.get(name)?.description ?? null,
	}));
	const requestedResource = pendingParams.resource ?? null;

	const displayName = session.user.name ?? session.user.email ?? session.user.id;

	return (
		<main className="min-h-screen bg-background p-6 text-foreground">
			<div className="mx-auto mt-16 w-full max-w-xl rounded-card border border-border bg-background p-8">
				<h1 className="text-2xl font-semibold">Authorize {clientName}</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					<span className="font-medium text-foreground">{clientName}</span> wants to access your
					account. Choose which account should authorize it.
				</p>

				<div className="mt-6 rounded-card border border-border p-4">
					<p className="text-sm font-medium">This will grant access to:</p>
					{consentScopes.length > 0 ? (
						<ul className="mt-3 flex flex-col gap-3">
							{consentScopes.map((scope) => (
								<li key={scope.name}>
									{scope.label ? (
										<>
											<span className="block text-sm font-medium">{scope.label}</span>
											{scope.description && (
												<span className="block text-sm text-muted-foreground">
													{scope.description}
												</span>
											)}
										</>
									) : (
										<span className="inline-flex items-center rounded-full bg-surface-sunken px-2 py-0.5 font-mono text-xs text-foreground">
											{scope.name}
										</span>
									)}
								</li>
							))}
						</ul>
					) : (
						<p className="mt-1 text-sm text-muted-foreground">
							No scopes are granted to this application.
						</p>
					)}
					{requestedResource && (
						<p className="mt-3 text-sm text-muted-foreground">
							Resource:{" "}
							<span className="font-mono text-xs text-foreground">{requestedResource}</span>
						</p>
					)}
				</div>

				<div className="mt-4 flex items-center gap-4 rounded-card border border-border p-4">
					{session.user.image ? (
						<div
							aria-label={displayName}
							className="h-12 w-12 rounded-full bg-cover bg-center"
							style={{ backgroundImage: `url("${session.user.image}")` }}
						/>
					) : (
						<div className="flex h-12 w-12 items-center justify-center rounded-full border border-border text-sm font-semibold">
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
					className="mt-6 block w-full rounded-full bg-brand px-4 py-2 text-center font-medium text-white hover:bg-brand-hover"
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
						className="w-full rounded-full border border-border px-4 py-2 font-medium hover:bg-surface-hover"
					>
						Sign in with a different account
					</button>
				</form>
			</div>
		</main>
	);
}
