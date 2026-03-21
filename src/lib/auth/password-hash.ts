import { md5 } from "@/lib/auth/md5";
import type { HashMethod } from "@/lib/config/hash-method";

/** Any valid https origin; routing is by service binding, not DNS. */
const ARGON_HASHER_HASH_URL = "https://argon-hasher.internal/hash";
const ARGON_HASHER_VERIFY_URL = "https://argon-hasher.internal/verify";

function logPasswordVerify(payload: Record<string, unknown>) {
	console.info(JSON.stringify({ event: "password_verify", ...payload }));
}

function isMd5HexStoredHash(stored: string): boolean {
	return /^[0-9a-f]{32}$/i.test(stored.trim());
}

/** For logs only — never log the raw stored hash. */
function storedHashKind(stored: string): string {
	if (isArgon2StoredHash(stored)) return "argon2id_phc";
	if (isMd5HexStoredHash(stored)) return "md5_hex_32";
	return `other_len_${stored.length}`;
}

export function isArgon2StoredHash(stored: string): boolean {
	return stored.startsWith("$argon2");
}

/** New password: Argon2 via service when bound, else MD5 hex (legacy local dev). */
export async function hashPasswordArgon2ViaService(
	plain: string,
	argonHasher: Fetcher
): Promise<string> {
	const hashRes = await argonHasher.fetch(
		new Request(ARGON_HASHER_HASH_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ password: plain }),
		})
	);
	if (!hashRes.ok) {
		const text = await hashRes.text().catch(() => "");
		throw new Error(
			`argon-hasher /hash failed: ${hashRes.status} ${hashRes.statusText}${text ? ` ${text.slice(0, 200)}` : ""}`
		);
	}
	const data = (await hashRes.json()) as { hash?: string };
	if (typeof data.hash !== "string" || !data.hash.startsWith("$argon2")) {
		throw new Error("argon-hasher /hash returned no Argon2 PHC string");
	}
	return data.hash;
}

export interface HashPasswordOptions {
	/** When set → Argon2 PHC via `POST /hash`. When unset → MD5 hex. */
	argonHasher?: Fetcher;
	/** `argon` requires `argonHasher`. `md5` uses MD5 hex only (ignores binding). */
	hashMethod?: HashMethod;
}

export async function hashPassword(plain: string, options?: HashPasswordOptions): Promise<string> {
	const method = options?.hashMethod ?? "md5";
	if (method === "argon") {
		if (!options?.argonHasher) {
			throw new Error("HASH_METHOD=argon requires ARGON_HASHER binding");
		}
		return hashPasswordArgon2ViaService(plain, options.argonHasher);
	}
	return md5(plain);
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

export interface VerifyPasswordOptions {
	argonHasher?: Fetcher;
	hashMethod?: HashMethod;
}

export interface VerifyPasswordResult {
	ok: boolean;
	/** MD5 matched with service bound — upgrade to Argon2. */
	rehash?: string;
}

/**
 * Verify: depends on `hashMethod`.
 * - **argon**: requires `argonHasher`; Argon2 via `/verify` or MD5 hex → upgrade. Never MD5-only fallback without binding.
 * - **md5**: MD5 hex rows only; rejects Argon2 PHC stored hashes.
 */
export async function verifyPassword(
	plain: string,
	storedHash: string,
	options?: VerifyPasswordOptions
): Promise<VerifyPasswordResult> {
	const method = options?.hashMethod ?? "md5";
	const argonHasher = options?.argonHasher;
	const kind = storedHashKind(storedHash);
	logPasswordVerify({
		step: "start",
		storedKind: kind,
		hashMethod: method,
		hasArgonHasherBinding: Boolean(argonHasher),
	});

	if (method === "md5") {
		if (isArgon2StoredHash(storedHash)) {
			logPasswordVerify({ step: "done", outcome: "md5_mode_rejects_argon2_stored" });
			return { ok: false };
		}
		if (!isMd5HexStoredHash(storedHash)) {
			logPasswordVerify({ step: "done", outcome: "unsupported_stored_format" });
			return { ok: false };
		}
		const ok = md5(plain) === storedHash.toLowerCase();
		logPasswordVerify({ step: "done", path: "md5_only", outcome: ok ? "match" : "mismatch" });
		return { ok };
	}

	const hasher = argonHasher;
	if (!hasher) {
		logPasswordVerify({ step: "done", outcome: "argon_mode_requires_binding" });
		return { ok: false };
	}

	if (isArgon2StoredHash(storedHash)) {
		logPasswordVerify({ step: "route", path: "argon2_service" });
		const ok = await verifyArgon2ViaHasherService(plain, storedHash, hasher);
		if (ok) {
			logPasswordVerify({ step: "done", outcome: "argon2_match" });
			return { ok: true };
		}
		logPasswordVerify({ step: "done", outcome: "argon2_mismatch" });
		return { ok: false };
	}
	if (isMd5HexStoredHash(storedHash)) {
		const legacy = md5(plain);
		const ok = legacy === storedHash.toLowerCase();
		logPasswordVerify({ step: "route", path: "md5_then_upgrade", outcome: ok ? "match" : "mismatch" });
		if (!ok) {
			return { ok: false };
		}
		const rehash = await hashPasswordArgon2ViaService(plain, hasher);
		logPasswordVerify({ step: "done", outcome: "md5_upgraded_to_argon2" });
		return { ok: true, rehash };
	}
	logPasswordVerify({ step: "done", outcome: "unsupported_stored_format" });
	return { ok: false };
}
