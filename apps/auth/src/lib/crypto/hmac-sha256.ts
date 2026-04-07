import { timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";

/**
 * HMAC-SHA256 over UTF-8 message and secret key; digest as lowercase hex (64 chars).
 */
export async function hmacSha256Hex(messageUtf8: string, secretKeyUtf8: string): Promise<string> {
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		enc.encode(secretKeyUtf8),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"]
	);
	const sig = await crypto.subtle.sign("HMAC", key, enc.encode(messageUtf8));
	const bytes = new Uint8Array(sig);
	return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqualHex(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	try {
		return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
	} catch {
		return false;
	}
}

export function timingSafeEqualUtf8(a: string, b: string): boolean {
	const ba = Buffer.from(a, "utf8");
	const bb = Buffer.from(b, "utf8");
	if (ba.length !== bb.length) return false;
	return timingSafeEqual(ba, bb);
}
