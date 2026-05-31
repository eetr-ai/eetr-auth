import { Buffer } from "node:buffer";
import { getAuthSecret } from "@/lib/auth/auth-secret";

/**
 * Reversible encryption for server-only secrets that must be recovered later (unlike
 * hashed OTPs). Used for TOTP secrets, which are needed in cleartext to verify codes.
 *
 * AES-GCM with a 256-bit key derived (SHA-256) from AUTH_SECRET. A fresh random IV is
 * generated per encryption and stored alongside the ciphertext as `base64(iv):base64(ct)`.
 */

async function getKey(): Promise<CryptoKey> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(getAuthSecret()));
	return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(plaintext: string): Promise<string> {
	const key = await getKey();
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ct = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv },
		key,
		new TextEncoder().encode(plaintext)
	);
	return `${Buffer.from(iv).toString("base64")}:${Buffer.from(new Uint8Array(ct)).toString("base64")}`;
}

export async function decryptSecret(payload: string): Promise<string> {
	const [ivB64, ctB64] = payload.split(":");
	if (!ivB64 || !ctB64) {
		throw new Error("Malformed encrypted secret.");
	}
	const key = await getKey();
	const iv = new Uint8Array(Buffer.from(ivB64, "base64"));
	const ct = new Uint8Array(Buffer.from(ctB64, "base64"));
	const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
	return new TextDecoder().decode(pt);
}
