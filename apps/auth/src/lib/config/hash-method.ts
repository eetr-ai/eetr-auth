/**
 * Password hashing policy: explicit `md5` vs `argon` (Argon2 via ARGON_HASHER).
 * Default `md5` matches legacy local dev; production should set `HASH_METHOD=argon`.
 */
export type HashMethod = "md5" | "argon";

export function resolveHashMethod(env?: Record<string, unknown>): HashMethod {
	const fromEnv =
		typeof env?.HASH_METHOD === "string" && env.HASH_METHOD.trim().length > 0
			? env.HASH_METHOD.trim()
			: null;
	const fromProcess =
		typeof process.env.HASH_METHOD === "string" && process.env.HASH_METHOD.trim().length > 0
			? process.env.HASH_METHOD.trim()
			: null;
	const raw = (fromEnv ?? fromProcess ?? "").toLowerCase();
	if (raw === "argon") return "argon";
	return "md5";
}
