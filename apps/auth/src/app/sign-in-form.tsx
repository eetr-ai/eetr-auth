"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { startAuthentication, browserSupportsWebAuthnAutofill } from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/types";
import {
	beginSignInChallenge,
	changePasswordAtSignIn,
	clearSignInChallenge,
	signOutFromChallenge,
	requestEmailMfaCode,
} from "@/app/actions/mfa-actions";
import { submitSignIn, submitPasskeySignIn } from "@/app/actions/sign-in-actions";
import type { PasswordPolicy } from "@/lib/repositories/password-policy.repository";
import { PasswordStep } from "./_components/password-step";
import { ChooseMethodStep } from "./_components/choose-method-step";
import { OtpStep } from "./_components/otp-step";
import { PasswordExpiredStep } from "./_components/password-expired-step";
import { PasswordComplexityStep } from "./_components/password-complexity-step";

/** A successful sign-in challenge response (the `ok: false` case is handled before routing). */
type SignInChallenge = Extract<Awaited<ReturnType<typeof beginSignInChallenge>>, { ok: true }>;

type Props = {
	mfaEnabled: boolean;
	callbackUrl: string;
};

export function SignInForm({ mfaEnabled, callbackUrl }: Props) {
	const [step, setStep] = useState<
		"password" | "choose" | "otp" | "password_expired" | "password_complexity"
	>("password");
	const [passwordResetEmailSent, setPasswordResetEmailSent] = useState(false);
	const [complexityPolicy, setComplexityPolicy] = useState<PasswordPolicy | null>(null);
	const [complexityEmail, setComplexityEmail] = useState<string | null>(null);
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

	// Routes a successful challenge response to the right step. Shared by the initial
	// password submit and the post-password-change continuation, so both behave identically.
	// `activePassword` is the password to carry into the eventual submitSignIn (the new one
	// after an in-place complexity change).
	const routeChallenge = async (r: SignInChallenge, activePassword: string) => {
		if (r.challenge === "none") {
			await submitSignIn({ username, password: activePassword, callbackUrl });
			return;
		}
		if (r.challenge === "password_expired") {
			setPasswordResetEmailSent(r.emailSent);
			setStep("password_expired");
			return;
		}
		if (r.challenge === "password_complexity") {
			setComplexityPolicy(r.policy);
			setComplexityEmail(r.email);
			setStep("password_complexity");
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
			await routeChallenge(r, password);
		});
	};

	// In-place password change at the complexity gate: persist the new password, adopt it,
	// then re-run the challenge so sign-in continues transparently (into MFA/none).
	const onComplexitySubmit = (newPassword: string) => {
		setError(null);
		startTransition(async () => {
			const changed = await changePasswordAtSignIn(username, password, newPassword);
			if (!changed.ok) {
				setError(changed.error);
				return;
			}
			setPassword(newPassword);
			const r = await beginSignInChallenge(username, newPassword);
			if (!r.ok) {
				setError(r.error);
				return;
			}
			await routeChallenge(r, newPassword);
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

	if (step === "password_expired") {
		return (
			<PasswordExpiredStep
				emailSent={passwordResetEmailSent}
				onBack={() => {
					setError(null);
					setPassword("");
					setStep("password");
				}}
			/>
		);
	}

	if (step === "password_complexity" && complexityPolicy) {
		return (
			<PasswordComplexityStep
				policy={complexityPolicy}
				username={username}
				email={complexityEmail}
				pending={pending}
				error={error}
				onSubmit={onComplexitySubmit}
				onBack={() => {
					setError(null);
					setPassword("");
					setStep("password");
				}}
			/>
		);
	}

	if (step === "choose") {
		return (
			<ChooseMethodStep
				error={error}
				pending={pending}
				onChooseMethod={onChooseMethod}
				onSignOut={onOtpSignOut}
			/>
		);
	}

	if (step === "otp") {
		return (
			<OtpStep
				otpPurpose={otpPurpose}
				mfaMethod={mfaMethod}
				mfaMethods={mfaMethods}
				otp={otp}
				onOtpChange={setOtp}
				error={error}
				pending={pending}
				onSubmit={onOtpSubmit}
				onSwitchMethod={switchMethod}
				onSignOut={onOtpSignOut}
			/>
		);
	}

	return (
		<PasswordStep
			callbackUrl={callbackUrl}
			username={username}
			onUsernameChange={setUsername}
			password={password}
			onPasswordChange={setPassword}
			error={error}
			pending={pending}
			passkeyPending={passkeyPending}
			mfaEnabled={mfaEnabled}
			onSubmit={onPasswordSubmit}
			onPasskeySignIn={onPasskeySignIn}
		/>
	);
}
