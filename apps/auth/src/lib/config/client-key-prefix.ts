/**
 * Prefix for generated OAuth client IDs (`<prefix>_<random>`).
 * Controlled by `CLIENT_KEY_PREFIX`; defaults to `eetr`.
 */
export const DEFAULT_CLIENT_KEY_PREFIX = "eetr" as const;

function normalizeClientKeyPrefix(value: string): string | null {
	const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
	return normalized.length > 0 ? normalized : null;
}

export function resolveClientKeyPrefix(env?: Record<string, unknown>): string {
	const fromEnv = typeof env?.CLIENT_KEY_PREFIX === "string" ? env.CLIENT_KEY_PREFIX : null;
	const fromProcess =
		typeof process.env.CLIENT_KEY_PREFIX === "string" ? process.env.CLIENT_KEY_PREFIX : null;

	return (
		(fromEnv ? normalizeClientKeyPrefix(fromEnv) : null) ??
		(fromProcess ? normalizeClientKeyPrefix(fromProcess) : null) ??
		DEFAULT_CLIENT_KEY_PREFIX
	);
}
