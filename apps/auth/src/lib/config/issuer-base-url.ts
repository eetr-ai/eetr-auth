/**
 * Fallback when `ISSUER_BASE_URL` is unset (e.g. misconfigured env). Prefer setting
 * `ISSUER_BASE_URL` in Wrangler `vars` / secrets so deployments are explicit.
 */
export const DEFAULT_ISSUER_BASE_URL = "https://auth.progression-ai.com" as const;

/**
 * Resolves the OAuth/OIDC issuer URL: Cloudflare `env` first, then `process.env` (Next dev),
 * then {@link DEFAULT_ISSUER_BASE_URL}. Trims and strips trailing slashes.
 */
export function resolveIssuerBaseUrl(env?: Record<string, unknown>): string {
	const fromEnv =
		typeof env?.ISSUER_BASE_URL === "string" && env.ISSUER_BASE_URL.trim().length > 0
			? env.ISSUER_BASE_URL.trim()
			: null;
	const fromProcess =
		typeof process.env.ISSUER_BASE_URL === "string" && process.env.ISSUER_BASE_URL.trim().length > 0
			? process.env.ISSUER_BASE_URL.trim()
			: null;
	const raw = fromEnv ?? fromProcess ?? DEFAULT_ISSUER_BASE_URL;
	return raw.replace(/\/+$/, "");
}
