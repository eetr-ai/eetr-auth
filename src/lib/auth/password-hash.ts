import { md5 } from "@/lib/auth/md5";

const SALT_BYTES = 16;

/** PBKDF2-HMAC-SHA256 via Web Crypto — works in Cloudflare Workers (no native addons). */
const PBKDF2_ITERATIONS = 210_000;

/** Any valid https origin; routing is by service binding, not DNS. */
const ARGON_HASHER_VERIFY_URL = "https://argon-hasher.internal/verify";

function logPasswordVerify(payload: Record<string, unknown>) {
	console.info(JSON.stringify({ event: "password_verify", ...payload }));
}

/** For logs only — never log the raw stored hash. */
function storedHashKind(stored: string): string {
	if (isPbkdf2StoredHash(stored)) return "pbkdf2-sha256";
	if (isArgon2StoredHash(stored)) return "argon2id_phc";
	const t = stored.trim();
	if (/^[0-9a-f]{32}$/i.test(t)) return "md5_hex_32";
	return `other_len_${stored.length}`;
}

const B64 =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function encodeB64NoPad(data: Uint8Array): string {
	const len = data.length;
	const extraBytes = len % 3;
	const parts: string[] = [];
	const len2 = len - extraBytes;
	for (let i = 0; i < len2; i += 3) {
		const tmp =
			((data[i] << 16) & 0xff0000) + ((data[i + 1] << 8) & 0xff00) + (data[i + 2] & 0xff);
		parts.push(
			B64.charAt((tmp >> 18) & 0x3f) +
				B64.charAt((tmp >> 12) & 0x3f) +
				B64.charAt((tmp >> 6) & 0x3f) +
				B64.charAt(tmp & 0x3f)
		);
	}
	if (extraBytes === 1) {
		const tmp = data[len - 1];
		parts.push(B64.charAt(tmp >> 2) + B64.charAt((tmp << 4) & 0x3f));
	} else if (extraBytes === 2) {
		const tmp = (data[len - 2] << 8) + data[len - 1];
		parts.push(
			B64.charAt(tmp >> 10) + B64.charAt((tmp >> 4) & 0x3f) + B64.charAt((tmp << 2) & 0x3f)
		);
	}
	return parts.join("");
}

function decodeB64NoPad(data: string): Uint8Array {
	const pad = data.length % 4 === 0 ? "" : "=".repeat(4 - (data.length % 4));
	const bin = atob(data + pad);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	let d = 0;
	for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
	return d === 0;
}

export function isArgon2StoredHash(stored: string): boolean {
	return stored.startsWith("$argon2");
}

export function isPbkdf2StoredHash(stored: string): boolean {
	return stored.startsWith("$pbkdf2-sha256$");
}

function parsePbkdf2Phc(encoded: string): {
	iterations: number;
	salt: Uint8Array;
	expectedHash: Uint8Array;
} | null {
	const parts = encoded.split("$");
	if (parts.length !== 5 || parts[1] !== "pbkdf2-sha256") {
		return null;
	}
	const iterations = Number(parts[2]);
	const salt = decodeB64NoPad(parts[3]);
	const expectedHash = decodeB64NoPad(parts[4]);
	if (!Number.isFinite(iterations) || salt.length === 0 || expectedHash.length === 0) {
		return null;
	}
	return { iterations, salt, expectedHash };
}

async function hashPasswordPbkdf2(plain: string): Promise<string> {
	const salt = new Uint8Array(SALT_BYTES);
	crypto.getRandomValues(salt);
	const enc = new TextEncoder();
	const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(plain), "PBKDF2", false, [
		"deriveBits",
	]);
	const bits = await crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			salt,
			iterations: PBKDF2_ITERATIONS,
			hash: "SHA-256",
		},
		keyMaterial,
		256
	);
	const hash = new Uint8Array(bits);
	return `$pbkdf2-sha256$${PBKDF2_ITERATIONS}$${encodeB64NoPad(salt)}$${encodeB64NoPad(hash)}`;
}

async function verifyPbkdf2(plain: string, encoded: string): Promise<boolean> {
	const parsed = parsePbkdf2Phc(encoded);
	if (!parsed) return false;
	const enc = new TextEncoder();
	const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(plain), "PBKDF2", false, [
		"deriveBits",
	]);
	const bits = await crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			salt: new Uint8Array(parsed.salt),
			iterations: parsed.iterations,
			hash: "SHA-256",
		},
		keyMaterial,
		parsed.expectedHash.length * 8
	);
	return timingSafeEqualBytes(new Uint8Array(bits), parsed.expectedHash);
}

async function verifyArgon2ViaHasherService(
	plain: string,
	storedHash: string,
	argonHasher: Fetcher
): Promise<boolean> {
	const verifyRes = await argonHasher.fetch(
		new Request(ARGON_HASHER_VERIFY_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ password: plain, hash: storedHash }),
		})
	);
	if (!verifyRes.ok) {
		logPasswordVerify({
			step: "argon2_hasher",
			outcome: "http_error",
			status: verifyRes.status,
			statusText: verifyRes.statusText,
		});
		return false;
	}
	try {
		const data = (await verifyRes.json()) as { valid?: boolean };
		const valid = data.valid === true;
		logPasswordVerify({
			step: "argon2_hasher",
			outcome: valid ? "valid" : "invalid_password",
		});
		return valid;
	} catch {
		logPasswordVerify({ step: "argon2_hasher", outcome: "bad_json_response" });
		return false;
	}
}

export async function hashPassword(plain: string): Promise<string> {
	return hashPasswordPbkdf2(plain);
}

export interface VerifyPasswordOptions {
	/** Service binding to the argon-hasher Worker; required for legacy Argon2 PHC verification. */
	argonHasher?: Fetcher;
}

export interface VerifyPasswordResult {
	ok: boolean;
	/** When legacy MD5 or Argon2 matched, set so the caller can persist a PBKDF2 hash. */
	rehash?: string;
}

/** Legacy 32-char hex MD5 in DB — independent of Argon2 service. */
async function verifyLegacyMd5Hex(
	plain: string,
	storedHash: string,
	source: "direct" | "argon2_without_hasher"
): Promise<VerifyPasswordResult> {
	logPasswordVerify({
		step: "legacy_md5",
		source,
	});
	const legacy = md5(plain);
	const ok = legacy === storedHash.toLowerCase();
	if (!ok) {
		logPasswordVerify({ step: "legacy_md5", source, outcome: "mismatch" });
		return { ok: false };
	}
	const rehash = await hashPasswordPbkdf2(plain);
	logPasswordVerify({
		step: "legacy_md5",
		source,
		outcome: "match",
		rehashToPbkdf2: true,
	});
	return { ok: true, rehash };
}

/**
 * Verifies password (PBKDF2, legacy Argon2id via argon-hasher, or legacy MD5 hex).
 * For Argon2 PHC: if `argonHasher` is bound, `/verify` is authoritative — failure does not fall back to MD5.
 * If the binding is absent (e.g. local dev), falls back to legacy MD5 hex (32-char rows only).
 */
export async function verifyPassword(
	plain: string,
	storedHash: string,
	options?: VerifyPasswordOptions
): Promise<VerifyPasswordResult> {
	const kind = storedHashKind(storedHash);
	logPasswordVerify({
		step: "start",
		storedKind: kind,
		hasArgonHasherBinding: Boolean(options?.argonHasher),
	});

	if (isPbkdf2StoredHash(storedHash)) {
		const ok = await verifyPbkdf2(plain, storedHash);
		logPasswordVerify({
			step: "pbkdf2",
			outcome: ok ? "match" : "mismatch",
		});
		return { ok };
	}
	if (isArgon2StoredHash(storedHash)) {
		const argonHasher = options?.argonHasher;
		if (argonHasher) {
			logPasswordVerify({ step: "route", path: "argon2_service" });
			const ok = await verifyArgon2ViaHasherService(plain, storedHash, argonHasher);
			if (ok) {
				const rehash = await hashPasswordPbkdf2(plain);
				logPasswordVerify({
					step: "argon2_done",
					outcome: "match",
					rehashToPbkdf2: true,
				});
				return { ok: true, rehash };
			}
			logPasswordVerify({
				step: "argon2_done",
				outcome: "reject_no_md5_fallback",
			});
			return { ok: false };
		}
		logPasswordVerify({
			step: "route",
			path: "argon2_no_hasher_try_legacy_md5",
		});
		return verifyLegacyMd5Hex(plain, storedHash, "argon2_without_hasher");
	}
	return verifyLegacyMd5Hex(plain, storedHash, "direct");
}
