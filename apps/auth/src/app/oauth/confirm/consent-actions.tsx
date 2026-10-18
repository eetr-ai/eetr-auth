"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { switchOAuthAccount } from "@/app/actions/sign-in-actions";

type Busy = "continue" | "switch" | null;

export default function ConsentActions({ displayName }: { displayName: string }) {
	const [busy, setBusy] = useState<Busy>(null);

	// Both buttons leave the page, so we never clear `busy` on success. The one way back
	// is the browser's Back button restoring this page from the bfcache — with the spinner
	// still running — so we reset there.
	useEffect(() => {
		const onPageShow = (event: PageTransitionEvent) => {
			if (event.persisted) setBusy(null);
		};
		window.addEventListener("pageshow", onPageShow);
		return () => window.removeEventListener("pageshow", onPageShow);
	}, []);

	return (
		<>
			<Button
				type="button"
				className="mt-6 w-full justify-center"
				loading={busy === "continue"}
				disabled={busy !== null}
				onClick={() => {
					// A button rather than a link so a second click cannot replay the
					// pending authorization while the first one is still on its way.
					setBusy("continue");
					window.location.assign("/api/authorize/complete");
				}}
			>
				Continue as {displayName}
			</Button>

			<form action={switchOAuthAccount} onSubmit={() => setBusy("switch")} className="mt-3">
				<SwitchAccountButton disabled={busy === "continue"} />
			</form>
		</>
	);
}

function SwitchAccountButton({ disabled }: { disabled: boolean }) {
	const { pending } = useFormStatus();
	return (
		<Button
			type="submit"
			variant="secondary"
			className="w-full justify-center"
			loading={pending}
			disabled={disabled}
		>
			Sign in with a different account
		</Button>
	);
}
