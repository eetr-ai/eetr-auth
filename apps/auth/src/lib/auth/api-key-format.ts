/**
 * The presented API-key credential: `eak_<keyId>_<secret>`.
 *
 * An Argon2id digest is not searchable, so unlike a client secret (which is presented
 * alongside its client_id) an API key has to carry its own lookup handle. `keyId` is that
 * handle -- stored in the clear, indexed, and safe to show in the admin UI -- and only
 * `secret` is hashed at rest.
 *
 * Both halves are lowercase hex so the separator is unambiguous: `_` can never appear
 * inside either half, and the prefix is fixed, so a plain three-way split is exact.
 */
export const API_KEY_PREFIX = "eak";

/** Bytes of randomness in each half. The handle only needs to be unique, not unguessable. */
const KEY_ID_BYTES = 8;
const SECRET_BYTES = 32;

export interface ParsedApiKey {
	keyId: string;
	secret: string;
}

function randomHex(byteLength: number): string {
	const bytes = new Uint8Array(byteLength);
	crypto.getRandomValues(bytes);
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

export interface GeneratedApiKey extends ParsedApiKey {
	/** The full credential shown to the operator exactly once. */
	presented: string;
}

export function generateApiKey(): GeneratedApiKey {
	const keyId = randomHex(KEY_ID_BYTES);
	const secret = randomHex(SECRET_BYTES);
	return { keyId, secret, presented: `${API_KEY_PREFIX}_${keyId}_${secret}` };
}

/**
 * Parse a presented credential. Returns null for anything malformed so the caller can
 * treat "not an API key" and "wrong API key" identically -- a shape-specific error would
 * tell a prober which half they got wrong.
 */
export function parseApiKey(presented: string): ParsedApiKey | null {
	const trimmed = presented.trim();
	const parts = trimmed.split("_");
	if (parts.length !== 3) {
		return null;
	}
	const [prefix, keyId, secret] = parts;
	if (prefix !== API_KEY_PREFIX) {
		return null;
	}
	if (keyId.length !== KEY_ID_BYTES * 2 || !/^[0-9a-f]+$/u.test(keyId)) {
		return null;
	}
	if (secret.length !== SECRET_BYTES * 2 || !/^[0-9a-f]+$/u.test(secret)) {
		return null;
	}
	return { keyId, secret };
}
