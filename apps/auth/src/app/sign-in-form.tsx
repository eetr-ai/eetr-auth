"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { startAuthentication, browserSupportsWebAuthnAutofill } from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/types";
import { LogOut, ShieldCheck, Smartphone, Mail } from "lucide-react";
import {
	beginSignInChallenge,
	clearSignInChallenge,
	signOutFromChallenge,
	requestEmailMfaCode,
} from "@/app/actions/mfa-actions";
import { submitSignIn, submitPasskeySignIn } from "@/app/actions/sign-in-actions";

type Props = {
	mfaEnabled: boolean;
	callbackUrl: string;
};

export function SignInForm({ mfaEnabled, callbackUrl }: Props) {
	const [step, setStep] = useState<"password" | "choose" | "otp">("password");
	const [otpPurpose, setOtpPurpose] = useState<"mfa" | "email_verification">("mfa");
	const [mfaMethods, setMfaMethods] = useState<("totp" | "email")[]>([]);
	const [mfaMethod, setMfaMethod] = useState<"totp" | "email">("totp");
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [otp, setOtp] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [pending, startTransition] = useTransition();
	const [passkeyPending, setPasskeyPending] = useState(false);
	const hasFallbackRpIdCandidate =
		typeof window !== "undefined" &&
		window.location.hostname !== "localhost" &&
		!window.location.hostname.includes(":") &&
		window.location.hostname.split(".").length >= 3;

	const runPasskeySignInAttempt = useCallback(
		async (useFallbackRpId: boolean, useBrowserAutofill = false): Promise<string> => {
			const challengePath = useFallbackRpId
				? "/api/auth/passkey/challenge?rpId=fallback"
				: "/api/auth/passkey/challenge";
			const challengeRes = await fetch(challengePath, { method: "POST" });
			if (!challengeRes.ok) throw new Error("Failed to get passkey challenge.");
			const { challengeId, options } = (await challengeRes.json()) as {
				challengeId: string;
				options: PublicKeyCredentialRequestOptionsJSON;
			};

			const authResponse = await startAuthentication(options, useBrowserAutofill);

			const verifyRes = await fetch("/api/auth/passkey/verify", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ challengeId, authenticationResponse: authResponse }),
			});
			if (!verifyRes.ok) {
				const body = await verifyRes.json().catch(() => ({}));
				throw new Error((body as { error_description?: string }).error_description ?? "Passkey verification failed.");
			}

			const { exchangeToken } = (await verifyRes.json()) as { exchangeToken: string };
			return exchangeToken;
		},
		[]
	);

	// Conditional UI (autofill): if the current device has a passkey for an account, the
	// browser surfaces it in the username field's autofill. This resolves only when the
	// user picks one, so failures/aborts are silent. The explicit button below stays as a
	// fallback. simplewebauthn auto-aborts this pending ceremony when the button starts one.
	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				if (!(await browserSupportsWebAuthnAutofill()) || cancelled) return;
				const exchangeToken = await runPasskeySignInAttempt(false, true);
				if (cancelled) return;
				await submitPasskeySignIn(exchangeToken, callbackUrl);
			} catch {
				// Autofill unsupported, aborted, or the user signed in another way — stay silent.
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [runPasskeySignInAttempt, callbackUrl]);

	const onPasskeySignIn = async () => {
		setError(null);
		setPasskeyPending(true);
		try {
			let exchangeToken: string;
			try {
				exchangeToken = await runPasskeySignInAttempt(false);
			} catch (err) {
				if (!hasFallbackRpIdCandidate) {
					throw err;
				}
				exchangeToken = await runPasskeySignInAttempt(true);
			}

			await submitPasskeySignIn(exchangeToken, callbackUrl);
		} catch (err) {
			if (err instanceof Error && err.name === "NotAllowedError") {
				// User cancelled or timed out — silent
			} else {
				setError(err instanceof Error ? err.message : "Passkey sign-in failed.");
			}
		} finally {
			setPasskeyPending(false);
		}
	};

	const onPasswordSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		startTransition(async () => {
			const r = await beginSignInChallenge(username, password);
			if (!r.ok) {
				setError(r.error);
				return;
			}
			if (r.challenge === "none") {
				await submitSignIn({ username, password, callbackUrl });
				return;
			}
			setOtp("");
			if (r.challenge === "email_verification") {
				setOtpPurpose("email_verification");
				setStep("otp");
				return;
			}
			// MFA challenge: one or two methods available for this user.
			setOtpPurpose("mfa");
			setMfaMethods(r.methods);
			if (r.methods.length > 1) {
				setStep("choose");
			} else {
				setMfaMethod(r.methods[0]);
				setStep("otp");
			}
		});
	};

	const onOtpSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		startTransition(async () => {
			await submitSignIn({
				username,
				password,
				otp,
				...(otpPurpose === "mfa" ? { mfaMethod } : {}),
				callbackUrl,
			});
		});
	};

	// Sends an email MFA code (sets the challenge cookie server-side), then advances.
	const sendEmailCodeThen = (next: () => void) => {
		setError(null);
		startTransition(async () => {
			const r = await requestEmailMfaCode(username, password);
			if (!r.ok) {
				setError(r.error);
				return;
			}
			setMfaMethod("email");
			setOtp("");
			next();
		});
	};

	const onChooseMethod = (method: "totp" | "email") => {
		if (method === "totp") {
			setError(null);
			setMfaMethod("totp");
			setOtp("");
			setStep("otp");
			return;
		}
		sendEmailCodeThen(() => setStep("otp"));
	};

	// Toggle between methods from the code screen when the user has both.
	const switchMethod = (method: "totp" | "email") => {
		if (method === mfaMethod) return;
		if (method === "totp") {
			setError(null);
			setMfaMethod("totp");
			setOtp("");
			return;
		}
		sendEmailCodeThen(() => {});
	};

	const onOtpSignOut = () => {
		setError(null);
		startTransition(async () => {
			await clearSignInChallenge();
			await signOutFromChallenge();
			setStep("password");
			setOtpPurpose("mfa");
			setMfaMethods([]);
			setMfaMethod("totp");
			setOtp("");
		});
	};

	if (step === "choose") {
		return (
			<div className="space-y-6">
				<p className="rounded-xl bg-brand-muted/30 px-3 py-2 text-sm text-foreground">
					Choose how you&apos;d like to verify this sign-in.
				</p>
				{error ? (
					<p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-200">{error}</p>
				) : null}
				<div className="space-y-3">
					<button
						type="button"
						disabled={pending}
						onClick={() => onChooseMethod("totp")}
						className="flex w-full items-center gap-3 rounded-xl border border-brand-muted px-4 py-3 text-left hover:bg-brand-muted/20 focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
					>
						<Smartphone className="h-5 w-5 shrink-0 text-muted-foreground" />
						<span className="flex-1">
							<span className="block text-sm font-medium text-foreground">Authenticator app</span>
							<span className="block text-xs text-muted-foreground">Enter the code from your authenticator app.</span>
						</span>
					</button>
					<button
						type="button"
						disabled={pending}
						onClick={() => onChooseMethod("email")}
						className="flex w-full items-center gap-3 rounded-xl border border-brand-muted px-4 py-3 text-left hover:bg-brand-muted/20 focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
					>
						<Mail className="h-5 w-5 shrink-0 text-muted-foreground" />
						<span className="flex-1">
							<span className="block text-sm font-medium text-foreground">Email code</span>
							<span className="block text-xs text-muted-foreground">
								{pending ? "Sending…" : "Send a 6-digit code to your email."}
							</span>
						</span>
					</button>
				</div>
				<button
					type="button"
					disabled={pending}
					onClick={onOtpSignOut}
					className="flex w-full items-center justify-center gap-2 text-sm text-muted-foreground underline hover:text-foreground"
				>
					<LogOut className="h-4 w-4" />
					Sign out
				</button>
			</div>
		);
	}

	if (step === "otp") {
		return (
			<form onSubmit={onOtpSubmit} className="space-y-6">
				<p className="rounded-xl bg-brand-muted/30 px-3 py-2 text-sm text-foreground">
					{otpPurpose === "email_verification"
						? "Enter the 6-digit email verification code sent to your email."
						: mfaMethod === "totp"
							? "Enter the 6-digit code from your authenticator app."
							: "Enter the 6-digit sign-in code sent to your email."}
				</p>
				<div className="space-y-2">
					<label htmlFor="otp" className="block text-sm font-medium text-foreground">
						Verification code
					</label>
					<input
						id="otp"
						name="otp"
						type="text"
						inputMode="numeric"
						autoComplete="one-time-code"
						pattern="[0-9]{6}"
						maxLength={6}
						required
						value={otp}
						onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
						className="w-full rounded-xl border border-brand-muted bg-background px-3 py-2 text-center tracking-[0.3em] text-foreground placeholder:text-foreground/50 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
						placeholder="000000"
					/>
				</div>
				{error ? (
					<p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-200">{error}</p>
				) : null}
				<button
					type="submit"
					disabled={pending}
					className="flex w-full items-center justify-center gap-2 rounded-full bg-brand px-4 py-2 font-medium text-white hover:bg-brand-muted focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50"
				>
					<ShieldCheck className="h-4 w-4" />
					{pending ? "Signing in…" : "Verify and sign in"}
				</button>
				{otpPurpose === "mfa" && mfaMethods.length > 1 ? (
					<button
						type="button"
						disabled={pending}
						onClick={() => switchMethod(mfaMethod === "totp" ? "email" : "totp")}
						className="flex w-full items-center justify-center gap-2 text-sm text-muted-foreground underline hover:text-foreground"
					>
						{mfaMethod === "totp" ? (
							<>
								<Mail className="h-4 w-4" />
								Use an email code instead
							</>
						) : (
							<>
								<Smartphone className="h-4 w-4" />
								Use your authenticator app
							</>
						)}
					</button>
				) : null}
				<button
					type="button"
					disabled={pending}
					onClick={onOtpSignOut}
					className="flex w-full items-center justify-center gap-2 text-sm text-muted-foreground underline hover:text-foreground"
				>
					<LogOut className="h-4 w-4" />
					Sign out
				</button>
			</form>
		);
	}

	return (
		<form onSubmit={onPasswordSubmit} className="space-y-6">
			<input type="hidden" name="callbackUrl" value={callbackUrl} readOnly />
			<div className="space-y-2">
				<label htmlFor="username" className="block text-sm font-medium text-foreground">
					Username
				</label>
				<input
					id="username"
					name="username"
					type="text"
					required
					autoComplete="username webauthn"
					value={username}
					onChange={(e) => setUsername(e.target.value)}
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
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					className="w-full rounded-xl border border-brand-muted bg-background px-3 py-2 text-foreground placeholder:text-foreground/50 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
					placeholder="Enter password"
				/>
			</div>
			{error ? (
				<p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-200">{error}</p>
			) : null}
			<button
				type="submit"
				disabled={pending}
				className="w-full rounded-full bg-brand px-4 py-2 font-medium text-white hover:bg-brand-muted focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50"
			>
				{pending ? "Continue…" : mfaEnabled ? "Continue" : "Sign in"}
			</button>
			<p className="text-center text-sm">
				<Link href="/forgot-password" className="text-muted-foreground underline hover:text-foreground">
					Forgot password?
				</Link>
			</p>
			<div className="relative flex items-center gap-3">
				<hr className="flex-1 border-brand-muted/40" />
				<span className="text-xs text-muted-foreground">or</span>
				<hr className="flex-1 border-brand-muted/40" />
			</div>
			<button
				type="button"
				disabled={pending || passkeyPending}
				onClick={onPasskeySignIn}
				className="w-full rounded-full border border-brand-muted px-4 py-2 text-sm font-medium text-foreground hover:bg-brand-muted/20 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50"
			>
				{passkeyPending ? "Waiting for passkey…" : "Sign in with passkey"}
			</button>
		</form>
	);
}
