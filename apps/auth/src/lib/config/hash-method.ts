/**
 * Password hashing policy: `argon` (Argon2 via ARGON_HASHER) vs `md5`.
 * `argon` is the secure default. `md5` is unsalted and exists only as a legacy
 * local-dev convenience — it must be opted into explicitly and is refused in production.
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
	if (raw === "md5") {
		// Fail closed: never let unsalted MD5 run in production, even if explicitly set.
		if (process.env.NODE_ENV === "production") {
			throw new Error("HASH_METHOD=md5 is not allowed in production; set HASH_METHOD=argon");
		}
		return "md5";
	}
	// Secure-by-default: anything unset/unknown resolves to argon, not MD5.
	return "argon";
}
