/**
 * Fallback when `JWKS_CDN_BASE_URL` is unset. Prefer setting it in Wrangler `vars`.
 * Used for `jwks_uri` in OIDC/OAuth metadata and as the default avatar CDN when
 * `AVATAR_CDN_BASE_URL` is not set.
 */
export const DEFAULT_JWKS_CDN_BASE_URL = "https://cdn.progression-ai.com" as const;

/**
 * Resolves the JWKS public CDN base URL: Cloudflare `env` first, then `process.env` (Next dev),
 * then {@link DEFAULT_JWKS_CDN_BASE_URL}. Trims and strips trailing slashes.
 */
export function resolveJwksCdnBaseUrl(env?: Record<string, unknown>): string {
	const fromEnv =
		typeof env?.JWKS_CDN_BASE_URL === "string" && env.JWKS_CDN_BASE_URL.trim().length > 0
			? env.JWKS_CDN_BASE_URL.trim()
			: null;
	const fromProcess =
		typeof process.env.JWKS_CDN_BASE_URL === "string" && process.env.JWKS_CDN_BASE_URL.trim().length > 0
			? process.env.JWKS_CDN_BASE_URL.trim()
			: null;
	const raw = fromEnv ?? fromProcess ?? DEFAULT_JWKS_CDN_BASE_URL;
	return raw.replace(/\/+$/, "");
}
