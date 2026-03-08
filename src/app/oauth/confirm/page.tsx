import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";

const AUTHORIZE_PARAM_KEYS = [
	"response_type",
	"client_id",
	"redirect_uri",
	"scope",
	"state",
	"code_challenge",
	"code_challenge_method",
] as const;

function parseAuthorizeCallbackUrl(raw: string | undefined, origin: string): URL | null {
	if (!raw) return null;
	try {
		const url = new URL(raw);
		if (url.origin !== origin) return null;
		if (url.pathname !== "/api/authorize") return null;
		return url;
	} catch {
		return null;
	}
}

export default async function OAuthConfirmPage({
	searchParams,
}: {
	searchParams: Promise<{ callbackUrl?: string }>;
}) {
	const session = await auth();
	const { callbackUrl } = await searchParams;
	const origin = process.env.NEXTAUTH_URL ?? "https://auth.progression-ai.com";
	const authorizeUrl = parseAuthorizeCallbackUrl(callbackUrl, origin);

	if (!authorizeUrl) {
		redirect("/");
	}

	if (!session?.user?.id) {
		redirect(`/?callbackUrl=${encodeURIComponent(authorizeUrl.toString())}`);
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

				<form action="/api/authorize" method="POST" className="mt-6">
					{AUTHORIZE_PARAM_KEYS.map((key) => {
						const value = authorizeUrl.searchParams.get(key);
						if (!value) return null;
						return <input key={key} type="hidden" name={key} value={value} />;
					})}
					<button
						type="submit"
						className="w-full rounded-full bg-brand px-4 py-2 font-medium text-white hover:bg-brand-muted"
					>
						Continue as {displayName}
					</button>
				</form>

				<form
					action={async () => {
						"use server";
						await signOut({
							redirectTo: `/?callbackUrl=${encodeURIComponent(authorizeUrl.toString())}`,
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
