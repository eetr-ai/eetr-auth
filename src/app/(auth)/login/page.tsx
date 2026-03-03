import Image from "next/image";
import { signIn } from "@/auth";

export default async function LoginPage({
	searchParams,
}: {
	searchParams: Promise<{ error?: string }>;
}) {
	const { error } = await searchParams;
	return (
		<div className="w-full max-w-sm space-y-8 rounded-lg border border-brand-muted bg-background p-8">
			<div className="flex flex-col items-center gap-4">
				<Image
					src="/logo.png"
					alt="ProgressionAI"
					width={120}
					height={120}
					priority
					className="rounded-lg"
				/>
				<h1 className="text-2xl font-semibold text-foreground">Sign in</h1>
			</div>
			{error === "CredentialsSignin" && (
				<p className="rounded-md bg-red-950/50 px-3 py-2 text-sm text-red-200">
					Invalid username or password.
				</p>
			)}
			<form
				action={async (formData: FormData) => {
					"use server";
					await signIn("credentials", {
						username: formData.get("username") as string,
						password: formData.get("password") as string,
						redirectTo: "/dashboard",
					});
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
						className="w-full rounded-md border border-brand-muted bg-background px-3 py-2 text-foreground placeholder:text-foreground/50 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
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
						className="w-full rounded-md border border-brand-muted bg-background px-3 py-2 text-foreground placeholder:text-foreground/50 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
						placeholder="Enter password"
					/>
				</div>
				<button
					type="submit"
					className="w-full rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-muted focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-background"
				>
					Sign in
				</button>
			</form>
		</div>
	);
}
