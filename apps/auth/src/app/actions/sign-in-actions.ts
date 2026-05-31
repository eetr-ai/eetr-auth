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
