"use server";

import { redirect } from "next/navigation";
import { AuthError, CredentialsSignin } from "next-auth";
import { signIn } from "@/auth";

export async function submitSignIn(params: {
	username: string;
	password: string;
	otp?: string;
	callbackUrl: string;
}) {
	const callbackUrl = params.callbackUrl?.trim() || "/";
	try {
		await signIn("credentials", {
			username: params.username,
			password: params.password,
			...(params.otp?.trim() ? { otp: params.otp.trim() } : {}),
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
