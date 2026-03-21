import { md5 } from "@/lib/auth/md5";

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
}

export async function hashPassword(plain: string, options?: HashPasswordOptions): Promise<string> {
	if (options?.argonHasher) {
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
}

export interface VerifyPasswordResult {
	ok: boolean;
	/** MD5 matched with service bound — upgrade to Argon2. */
	rehash?: string;
}

/**
 * Verify: **argon-hasher** when `argonHasher` is set (Argon2 PHC via `/verify`, or MD5 hex → upgrade).
 * **Without** binding: **MD5 hex only** (32-char rows).
 */
export async function verifyPassword(
	plain: string,
	storedHash: string,
	options?: VerifyPasswordOptions
): Promise<VerifyPasswordResult> {
	const argonHasher = options?.argonHasher;
	const kind = storedHashKind(storedHash);
	logPasswordVerify({
		step: "start",
		storedKind: kind,
		hasArgonHasherBinding: Boolean(argonHasher),
	});

	if (argonHasher) {
		if (isArgon2StoredHash(storedHash)) {
			logPasswordVerify({ step: "route", path: "argon2_service" });
			const ok = await verifyArgon2ViaHasherService(plain, storedHash, argonHasher);
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
			const rehash = await hashPasswordArgon2ViaService(plain, argonHasher);
			logPasswordVerify({ step: "done", outcome: "md5_upgraded_to_argon2" });
			return { ok: true, rehash };
		}
		logPasswordVerify({ step: "done", outcome: "unsupported_stored_format" });
		return { ok: false };
	}

	if (!isMd5HexStoredHash(storedHash)) {
		logPasswordVerify({
			step: "done",
			outcome: "md5_fallback_requires_32_hex_stored",
		});
		return { ok: false };
	}
	const ok = md5(plain) === storedHash.toLowerCase();
	logPasswordVerify({ step: "done", path: "md5_only", outcome: ok ? "match" : "mismatch" });
	return { ok };
}
