import Image from "next/image";
import { redirect } from "next/navigation";
import { AuthError, CredentialsSignin } from "next-auth";
import { signIn, signOut, auth } from "@/auth";

export default async function HomePage({
	searchParams,
}: {
	searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
	const session = await auth();
	const { error, callbackUrl } = await searchParams;
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
		<div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4">
			<div className="w-full max-w-sm space-y-8 rounded-xl border border-brand-muted bg-background p-8">
				<div className="flex flex-col items-center gap-4">
					<Image
						src="/logo.png"
						alt="ProgressionAI"
						width={120}
						height={120}
						priority
						className="rounded-xl"
					/>
					<h1 className="text-2xl font-semibold text-foreground">Sign in</h1>
				</div>
				{error === "CredentialsSignin" && (
					<p className="rounded-xl bg-red-950/50 px-3 py-2 text-sm text-red-200">
						Invalid username or password.
					</p>
				)}
				{error === "AuthError" && (
					<p className="rounded-xl bg-red-950/50 px-3 py-2 text-sm text-red-200">
						Something went wrong. Please try again.
					</p>
				)}
				{session?.user?.id ? (
					<div className="space-y-4">
						<p className="rounded-xl bg-brand-muted/30 px-3 py-2 text-sm">
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
								className="w-full rounded-full border border-brand-muted px-4 py-2 font-medium text-foreground hover:bg-brand-muted/30"
							>
								Sign out
							</button>
						</form>
					</div>
				) : (
					<form
						action={async (formData: FormData) => {
							"use server";
							try {
								await signIn("credentials", {
									username: formData.get("username") as string,
									password: formData.get("password") as string,
									redirectTo:
										(typeof formData.get("callbackUrl") === "string"
											? (formData.get("callbackUrl") as string)
											: null) ?? "/",
								});
							} catch (err) {
								if (err instanceof CredentialsSignin) {
									redirect("/?error=CredentialsSignin");
								}
								if (err instanceof AuthError) {
									redirect("/?error=AuthError");
								}
								throw err;
							}
						}}
						className="space-y-6"
					>
						<input
							type="hidden"
							name="callbackUrl"
							value={callbackUrl && callbackUrl.trim().length > 0 ? callbackUrl : "/"}
						/>
						<div className="space-y-2">
							<label htmlFor="username" className="block text-sm font-medium text-foreground">
								Username
							</label>
							<input
								id="username"
								name="username"
								type="text"
								required
								autoComplete="username"
								className="w-full rounded-xl border border-brand-muted bg-background px-3 py-2 text-foreground placeholder:text-foreground/50 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
								placeholder="Enter username"
							/>
						</div>
						<div className="space-y-2">
							<label htmlFor="password" className="block text-sm font-medium text-foreground">
								Password
							</label>
							<input
								id="password"
								name="password"
								type="password"
								required
								autoComplete="current-password"
								className="w-full rounded-xl border border-brand-muted bg-background px-3 py-2 text-foreground placeholder:text-foreground/50 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
								placeholder="Enter password"
							/>
						</div>
						<button
							type="submit"
							className="w-full rounded-full bg-brand px-4 py-2 font-medium text-white hover:bg-brand-muted focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-background"
						>
							Sign in
						</button>
					</form>
				)}
			</div>
		</div>
	);
}
