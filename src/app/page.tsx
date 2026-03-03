import Image from "next/image";
import { redirect } from "next/navigation";
import { AuthError, CredentialsSignin } from "next-auth";
import { signIn, auth } from "@/auth";

export default async function HomePage({
	searchParams,
}: {
	searchParams: Promise<{ error?: string }>;
}) {
	const session = await auth();
	if (session?.user) redirect("/dashboard");

	const { error } = await searchParams;
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
				<form
					action={async (formData: FormData) => {
						"use server";
						try {
							await signIn("credentials", {
								username: formData.get("username") as string,
								password: formData.get("password") as string,
								redirectTo: "/dashboard",
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
			</div>
		</div>
	);
}
