"use client";

import { useEffect, useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/types";
import { Fingerprint, Loader2 } from "lucide-react";

type Status = "loading" | "prompt" | "enrolling" | "enrolled" | "dismissed" | "hidden";

export default function PasskeyPrompt() {
	const [status, setStatus] = useState<Status>("loading");
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		fetch("/api/users/passkey/has")
			.then((r) => r.json())
			.then((data) => {
				if (cancelled) return;
				const hasPasskey = Boolean((data as { hasPasskey?: boolean }).hasPasskey);
				setStatus(hasPasskey ? "hidden" : "prompt");
			})
			.catch(() => {
				if (!cancelled) setStatus("hidden");
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const handleEnroll = async () => {
		setError(null);
		setStatus("enrolling");
		try {
			const challengeRes = await fetch("/api/users/passkey/challenge", { method: "POST" });
			if (!challengeRes.ok) {
				const body = (await challengeRes.json()) as { error_description?: string };
				throw new Error(body.error_description ?? "Failed to get passkey challenge.");
			}
			const { challengeId, options } = (await challengeRes.json()) as {
				challengeId: string;
				options: PublicKeyCredentialCreationOptionsJSON;
			};

			const regResponse = await startRegistration(options);

			const registerRes = await fetch("/api/users/passkey/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ challengeId, registrationResponse: regResponse }),
			});
			if (!registerRes.ok) {
				const body = (await registerRes.json()) as { error_description?: string };
				throw new Error(body.error_description ?? "Passkey registration failed.");
			}
			setStatus("enrolled");
		} catch (err) {
			if (err instanceof Error && err.name === "NotAllowedError") {
				setStatus("prompt");
			} else {
				setError(err instanceof Error ? err.message : "Passkey enrollment failed.");
				setStatus("prompt");
			}
		}
	};

	if (status === "loading" || status === "hidden" || status === "dismissed") {
		return null;
	}

	if (status === "enrolled") {
		return (
			<div className="mt-6 flex items-center gap-2 rounded-xl border border-brand-muted bg-green-950/30 p-4 text-sm text-green-300">
				<Fingerprint className="h-4 w-4" />
				Passkey enrolled. You can use it next time to sign in faster.
			</div>
		);
	}

	return (
		<div className="mt-6 rounded-xl border border-brand-muted p-4">
			<div className="flex items-start gap-3">
				<Fingerprint className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
				<div className="flex-1">
					<p className="text-sm font-medium">Sign in faster next time</p>
					<p className="mt-1 text-sm text-muted-foreground">
						Create a passkey on this device to sign in without a password.
					</p>
					{error && (
						<p className="mt-2 rounded-xl bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</p>
					)}
					<div className="mt-3 flex items-center gap-3">
						<button
							type="button"
							disabled={status === "enrolling"}
							onClick={handleEnroll}
							className="flex items-center gap-2 rounded-full border border-brand-muted px-4 py-2 text-sm font-medium hover:bg-brand-muted/20 disabled:opacity-50"
						>
							{status === "enrolling" ? (
								<>
									<Loader2 className="h-4 w-4 animate-spin" />
									Waiting for device…
								</>
							) : (
								<>
									<Fingerprint className="h-4 w-4" />
									Create a passkey
								</>
							)}
						</button>
						<button
							type="button"
							disabled={status === "enrolling"}
							onClick={() => setStatus("dismissed")}
							className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
						>
							Not now
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
