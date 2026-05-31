"use server";

import { auth } from "@/auth";
import { onServerAction } from "@/lib/context/on-server-action";

async function requireSessionUser() {
	const session = await auth();
	if (!session?.user?.id) throw new Error("Unauthorized");
	return session.user;
}

/** Display-only enrollment status for the current user (never exposes the secret). */
export async function getTotpStatus() {
	const user = await requireSessionUser();
	return onServerAction(async (_ctx, getServices) => {
		const { totpService } = getServices();
		return totpService.getStatus(user.id);
	});
}

/** Starts (or restarts) enrollment: returns the otpauth URI and base32 secret. */
export async function beginTotpEnrollment() {
	const user = await requireSessionUser();
	return onServerAction(async (_ctx, getServices) => {
		const { totpService } = getServices();
		return totpService.beginEnrollment({
			id: user.id,
			username: user.username,
			email: user.email,
		});
	});
}

/** Verifies the first code and activates the enrollment. Throws on a bad code. */
export async function confirmTotpEnrollment(code: string) {
	const user = await requireSessionUser();
	return onServerAction(async (_ctx, getServices) => {
		const { totpService } = getServices();
		const ok = await totpService.confirmEnrollment(user.id, code);
		if (!ok) {
			throw new Error("That code didn't match. Make sure your device's time is correct and try a fresh code.");
		}
		return { ok: true as const };
	});
}

export async function disableTotp() {
	const user = await requireSessionUser();
	return onServerAction(async (_ctx, getServices) => {
		const { totpService } = getServices();
		await totpService.disable(user.id);
		return { ok: true as const };
	});
}
