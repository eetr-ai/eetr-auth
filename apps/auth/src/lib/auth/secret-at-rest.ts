import {
	hmacSha256Hex,
	timingSafeEqualHex,
	timingSafeEqualUtf8,
} from "@/lib/crypto/hmac-sha256";

/** Stored OAuth client_secret: HMAC-SHA256 digest (hex) with this prefix. */
export const CLIENT_SECRET_AT_REST_PREFIX = "h1:" as const;

export function resolveHmacKey(env?: Record<string, unknown>): string | null {
	const fromEnv =
		typeof env?.HMAC_KEY === "string" && env.HMAC_KEY.trim().length > 0
			? env.HMAC_KEY.trim()
			: null;
	const fromProcess =
		typeof process.env.HMAC_KEY === "string" && process.env.HMAC_KEY.trim().length > 0
			? process.env.HMAC_KEY.trim()
			: null;
	return fromEnv ?? fromProcess;
}

export async function hashClientSecretForStorage(plain: string, hmacKey: string): Promise<string> {
	const hex = await hmacSha256Hex(plain, hmacKey);
	return `${CLIENT_SECRET_AT_REST_PREFIX}${hex}`;
}

/**
 * Verifies presented client secret against DB value.
 * Legacy rows hold plaintext; `h1:` rows require HMAC_KEY. On legacy match with key set, returns `upgradeToStored` for lazy migration.
 */
export async function verifyClientSecretAgainstStored(
	presentedPlain: string,
	stored: string,
	hmacKey: string | null
): Promise<{ ok: boolean; upgradeToStored?: string }> {
	if (stored.startsWith(CLIENT_SECRET_AT_REST_PREFIX)) {
		if (!hmacKey) {
			return { ok: false };
		}
		const expectedHex = await hmacSha256Hex(presentedPlain, hmacKey);
		const storedHex = stored.slice(CLIENT_SECRET_AT_REST_PREFIX.length);
		if (!timingSafeEqualHex(expectedHex, storedHex)) {
			return { ok: false };
		}
		return { ok: true };
	}
	if (!timingSafeEqualUtf8(presentedPlain, stored)) {
		return { ok: false };
	}
	if (hmacKey) {
		const upgradeToStored = await hashClientSecretForStorage(presentedPlain, hmacKey);
		return { ok: true, upgradeToStored };
	}
	return { ok: true };
}
