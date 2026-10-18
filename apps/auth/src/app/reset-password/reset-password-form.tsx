"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completePasswordReset } from "@/app/actions/password-reset-actions";
import { Input, Label } from "@/components/ui";

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
				<Label htmlFor="password">
					New password
				</Label>
				<Input
					id="password"
					type="password"
					required
					autoComplete="new-password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
				/>
			</div>
			<div>
				<Label htmlFor="confirm">
					Confirm password
				</Label>
				<Input
					id="confirm"
					type="password"
					required
					autoComplete="new-password"
					value={confirm}
					onChange={(e) => setConfirm(e.target.value)}
				/>
			</div>
			{error ? (
				<p className="rounded-card bg-danger-bg px-3 py-2 text-sm text-danger-fg">{error}</p>
			) : null}
			<button
				type="submit"
				disabled={pending}
				className="w-full rounded-full bg-brand px-4 py-2 font-medium text-white hover:bg-brand-hover disabled:opacity-50"
			>
				{pending ? "Saving…" : "Set password"}
			</button>
		</form>
	);
}
