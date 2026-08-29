"use server";

import { redirect } from "next/navigation";
import { AuthError, CredentialsSignin } from "next-auth";
import { signIn } from "@/auth";

export async function submitPasskeySignIn(exchangeToken: string, callbackUrl: string) {
	const redirectTo = callbackUrl?.trim() || "/dashboard";
	try {
		await signIn("passkey", { exchangeToken, redirectTo });
	} catch (err) {
		if (err instanceof CredentialsSignin) {
			redirect(`/?error=CredentialsSignin&callbackUrl=${encodeURIComponent(redirectTo)}`);
		}
		if (err instanceof AuthError) {
			redirect(`/?error=AuthError&callbackUrl=${encodeURIComponent(redirectTo)}`);
		}
		throw err;
	}
}

export async function submitSignIn(params: {
	username: string;
	password: string;
	otp?: string;
	mfaMethod?: "totp" | "email";
	callbackUrl: string;
}) {
	const callbackUrl = params.callbackUrl?.trim() || "/";
	try {
		await signIn("credentials", {
			username: params.username,
			password: params.password,
			...(params.otp?.trim() ? { otp: params.otp.trim() } : {}),
			...(params.mfaMethod ? { mfaMethod: params.mfaMethod } : {}),
			redirectTo: callbackUrl,
		});
	} catch (err) {
		if (err instanceof CredentialsSignin) {
			redirect(`/?error=CredentialsSignin&callbackUrl=${encodeURIComponent(callbackUrl)}`);
		}
		if (err instanceof AuthError) {
			redirect(`/?error=AuthError&callbackUrl=${encodeURIComponent(callbackUrl)}`);
		}
		throw err;
	}
}

/**
 * One-click sign-in as a test user, from a test client's sign-in page.
 *
 * `userId` is a selector, not authority: the `test-user` provider re-derives every
 * condition (pending authorization, client is a test client, user is a non-admin test
 * user granted that environment) before minting anything. Like the other sign-in actions
 * this holds no logic of its own -- it exists to call signIn from a client component.
 */
export async function submitTestUserSignIn(userId: string, callbackUrl: string) {
	const redirectTo = callbackUrl?.trim() || "/oauth/confirm";
	try {
		await signIn("test-user", { userId, redirectTo });
	} catch (err) {
		if (err instanceof CredentialsSignin) {
			redirect(`/?error=CredentialsSignin&callbackUrl=${encodeURIComponent(redirectTo)}`);
		}
		if (err instanceof AuthError) {
			redirect(`/?error=AuthError&callbackUrl=${encodeURIComponent(redirectTo)}`);
		}
		throw err;
	}
}
