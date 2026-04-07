"use client";

import { useEffect, useState } from "react";
import { cancelPasswordReset } from "@/app/actions/password-reset-actions";

type Props = { token: string };

export function CancelPasswordResetClient({ token }: Props) {
	const [phase, setPhase] = useState<"loading" | "ok" | "error">("loading");
	const [message, setMessage] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				await cancelPasswordReset(token);
				if (!cancelled) setPhase("ok");
			} catch (err) {
				if (!cancelled) {
					setPhase("error");
					setMessage(err instanceof Error ? err.message : "Could not cancel this reset.");
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [token]);

	if (phase === "loading") {
		return <p className="text-center text-sm text-muted-foreground">Cancelling reset…</p>;
	}
	if (phase === "ok") {
		return (
			<p className="rounded-xl bg-emerald-950/40 px-3 py-2 text-center text-sm text-emerald-100">
				This password reset has been cancelled. The link in the email no longer works.
			</p>
		);
	}
	return (
		<p className="rounded-xl bg-red-950/50 px-3 py-2 text-sm text-red-200">
			{message ?? "Something went wrong."}
		</p>
	);
}
