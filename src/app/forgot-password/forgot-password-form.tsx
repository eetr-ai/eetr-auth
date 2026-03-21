"use client";

import { useState, useTransition } from "react";
import { requestPasswordReset } from "@/app/actions/password-reset-actions";

export function ForgotPasswordForm() {
	const [email, setEmail] = useState("");
	const [done, setDone] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [pending, startTransition] = useTransition();

	const onSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		startTransition(async () => {
			try {
				await requestPasswordReset(email);
				setDone(true);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Something went wrong.");
			}
		});
	};

	if (done) {
		return (
			<p className="rounded-xl bg-brand-muted/30 px-3 py-2 text-sm text-foreground">
				If an account exists for that email, you will receive a password reset link shortly.
			</p>
		);
	}

	return (
		<form onSubmit={onSubmit} className="space-y-4">
			<div>
				<label htmlFor="email" className="mb-1 block text-sm font-medium">
					Email
				</label>
				<input
					id="email"
					type="email"
					required
					autoComplete="email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					className="w-full rounded-xl border border-brand-muted bg-background px-3 py-2 text-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
					placeholder="you@example.com"
				/>
			</div>
			{error ? (
				<p className="rounded-xl bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</p>
			) : null}
			<button
				type="submit"
				disabled={pending}
				className="w-full rounded-full bg-brand px-4 py-2 font-medium text-white hover:bg-brand-muted disabled:opacity-50"
			>
				{pending ? "Sending…" : "Send reset link"}
			</button>
		</form>
	);
}
