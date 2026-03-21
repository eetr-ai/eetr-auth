import { argon2id, argon2Verify } from "hash-wasm";
import { md5 } from "@/lib/auth/md5";

/** Argon2id memory in KiB (19 MiB). Tuned for Cloudflare Workers CPU/memory limits. */
const ARGON2_MEMORY_KIB = 19456;
const ARGON2_ITERATIONS = 3;
const ARGON2_PARALLELISM = 1;
const ARGON2_HASH_LENGTH = 32;
const SALT_BYTES = 16;

export function isArgon2StoredHash(stored: string): boolean {
	return stored.startsWith("$argon2");
}

export async function hashPassword(plain: string): Promise<string> {
	const salt = new Uint8Array(SALT_BYTES);
	crypto.getRandomValues(salt);
	return argon2id({
		password: new TextEncoder().encode(plain),
		salt,
		iterations: ARGON2_ITERATIONS,
		parallelism: ARGON2_PARALLELISM,
		memorySize: ARGON2_MEMORY_KIB,
		hashLength: ARGON2_HASH_LENGTH,
		outputType: "encoded",
	});
}

export interface VerifyPasswordResult {
	ok: boolean;
	/** When legacy MD5 matched, set this so the caller can persist Argon2id. */
	rehash?: string;
}

/**
 * Verifies password against stored hash (Argon2id PHC string or legacy 32-char hex MD5).
 */
export async function verifyPassword(plain: string, storedHash: string): Promise<VerifyPasswordResult> {
	if (isArgon2StoredHash(storedHash)) {
		const ok = await argon2Verify({
			password: new TextEncoder().encode(plain),
			hash: storedHash,
		});
		return { ok };
	}
	const legacy = md5(plain);
	const ok = legacy === storedHash.toLowerCase();
	if (!ok) {
		return { ok: false };
	}
	const rehash = await hashPassword(plain);
	return { ok: true, rehash };
}
