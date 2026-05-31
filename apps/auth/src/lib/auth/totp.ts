import { timingSafeEqualUtf8 } from "@/lib/crypto/hmac-sha256";

/**
 * RFC 6238 TOTP (HMAC-SHA1, 6 digits, 30s step) implemented with Web Crypto so it runs
 * on Cloudflare Workers. Compatible with Google Authenticator and other RFC 6238 apps.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;

export function base32Encode(bytes: Uint8Array): string {
	let bits = 0;
	let value = 0;
	let out = "";
	for (const b of bytes) {
		value = (value << 8) | b;
		bits += 8;
		while (bits >= 5) {
			out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	if (bits > 0) {
		out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
	}
	return out;
}

export function base32Decode(input: string): Uint8Array<ArrayBuffer> {
	const clean = input.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
	let bits = 0;
	let value = 0;
	const out: number[] = [];
	for (const ch of clean) {
		const idx = BASE32_ALPHABET.indexOf(ch);
		if (idx === -1) {
			throw new Error("Invalid base32 character.");
		}
		value = (value << 5) | idx;
		bits += 5;
		if (bits >= 8) {
			out.push((value >>> (bits - 8)) & 0xff);
			bits -= 8;
		}
	}
	return new Uint8Array(out);
}

/** Random 20-byte secret as a base32 string (the format authenticator apps expect). */
export function generateSecret(): string {
	return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

function counterBytes(counter: number): Uint8Array<ArrayBuffer> {
	const buf = new Uint8Array(8);
	let c = counter;
	for (let i = 7; i >= 0; i--) {
		buf[i] = c & 0xff;
		c = Math.floor(c / 256);
	}
	return buf;
}

async function hotp(secretBytes: Uint8Array<ArrayBuffer>, counter: number): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		secretBytes,
		{ name: "HMAC", hash: "SHA-1" },
		false,
		["sign"]
	);
	const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBytes(counter)));
	const offset = sig[19] & 0x0f;
	const binary =
		((sig[offset] & 0x7f) << 24) |
		((sig[offset + 1] & 0xff) << 16) |
		((sig[offset + 2] & 0xff) << 8) |
		(sig[offset + 3] & 0xff);
	return (binary % 10 ** DIGITS).toString().padStart(DIGITS, "0");
}

function currentStep(nowMs: number): number {
	return Math.floor(nowMs / 1000 / STEP_SECONDS);
}

export async function totpCodeAt(secret: string, step: number): Promise<string> {
	return hotp(base32Decode(secret), step);
}

/**
 * Verifies a 6-digit code against the secret, accepting ±`window` time steps for clock
 * skew (default 1, i.e. ~90s tolerance). Comparison is constant-time.
 */
export async function verifyTotp(
	secret: string,
	code: string,
	opts: { window?: number; nowMs?: number } = {}
): Promise<boolean> {
	const window = opts.window ?? 1;
	const normalized = code.trim();
	if (!/^\d{6}$/.test(normalized)) {
		return false;
	}
	const step = currentStep(opts.nowMs ?? Date.now());
	const secretBytes = base32Decode(secret);
	for (let w = -window; w <= window; w++) {
		const candidate = await hotp(secretBytes, step + w);
		if (timingSafeEqualUtf8(candidate, normalized)) {
			return true;
		}
	}
	return false;
}

/**
 * Builds the `otpauth://` URI an authenticator app reads from a QR code. Parameters are
 * percent-encoded (spaces as %20, not +) since not all authenticator apps treat `+` as a
 * space in the query string.
 */
export function buildOtpauthUri(params: { secret: string; accountName: string; issuer: string }): string {
	const { secret, accountName, issuer } = params;
	const label = encodeURIComponent(`${issuer}:${accountName}`);
	const query = [
		`secret=${encodeURIComponent(secret)}`,
		`issuer=${encodeURIComponent(issuer)}`,
		"algorithm=SHA1",
		`digits=${DIGITS}`,
		`period=${STEP_SECONDS}`,
	].join("&");
	return `otpauth://totp/${label}?${query}`;
}
