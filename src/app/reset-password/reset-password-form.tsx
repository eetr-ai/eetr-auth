"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completePasswordReset } from "@/app/actions/password-reset-actions";

type Props = { token: string };

export function ResetPasswordForm({ token }: Props) {
	const router = useRouter();
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [pending, startTransition] = useTransition();

	const onSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		if (password !== confirm) {
			setError("Passwords do not match.");
			return;
		}
		if (password.length < 8) {
			setError("Password must be at least 8 characters.");
			return;
		}
		startTransition(async () => {
			try {
				await completePasswordReset(token, password);
				router.push("/?reset=success");
			} catch (err) {
				setError(err instanceof Error ? err.message : "Could not reset password.");
			}
		});
	};

	return (
		<form onSubmit={onSubmit} className="space-y-4">
			<div>
				<label htmlFor="password" className="mb-1 block text-sm font-medium">
					New password
				</label>
				<input
					id="password"
					type="password"
					required
					autoComplete="new-password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					className="w-full rounded-xl border border-brand-muted bg-background px-3 py-2 text-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
				/>
			</div>
			<div>
				<label htmlFor="confirm" className="mb-1 block text-sm font-medium">
					Confirm password
				</label>
				<input
					id="confirm"
					type="password"
					required
					autoComplete="new-password"
					value={confirm}
					onChange={(e) => setConfirm(e.target.value)}
					className="w-full rounded-xl border border-brand-muted bg-background px-3 py-2 text-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
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
				{pending ? "Saving…" : "Set password"}
			</button>
		</form>
	);
}
