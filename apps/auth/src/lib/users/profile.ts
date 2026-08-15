import { resolveJwksCdnBaseUrl } from "@/lib/config/jwks-cdn-base-url";

export function normalizeOptionalProfileField(value: string | null | undefined): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

export function getAvatarCdnBaseUrl(env: Record<string, unknown>): string {
	if (typeof env.AVATAR_CDN_BASE_URL === "string" && env.AVATAR_CDN_BASE_URL.trim().length > 0) {
		return env.AVATAR_CDN_BASE_URL.replace(/\/+$/, "");
	}
	return resolveJwksCdnBaseUrl(env);
}

/**
 * A user's avatar URL.
 *
 * `siteCdnUrl` is the CDN URL from site settings; pass it wherever the settings
 * row is available, which is everywhere an avatar URL is built today. There is
 * deliberately no env-only variant: one existed, and it silently ignored the
 * setting, which is how avatars came to point at a different host than the logo.
 */
export function resolveAvatarUrl(
	avatarKey: string | null | undefined,
	siteCdnUrl: string | null | undefined,
	env: Record<string, unknown>,
): string | null {
	if (!avatarKey) return null;
	return buildAssetUrl(avatarKey, pickAssetCdnBaseUrl(siteCdnUrl, getAvatarCdnBaseUrl(env)));
}

/**
 * The base URL assets are served from.
 *
 * The CDN URL in Setup → Site identity wins over the environment: it is the
 * operator-facing control, and `AVATAR_CDN_BASE_URL` / `JWKS_CDN_BASE_URL` are
 * the deploy-time default it overrides. Avatars and the site logo both resolve
 * through here, so one setting moves every asset rather than only the logo.
 */
export function pickAssetCdnBaseUrl(
	siteCdnUrl: string | null | undefined,
	envBaseUrl: string,
): string {
	const fromSettings = typeof siteCdnUrl === "string" ? siteCdnUrl.trim() : "";
	const base = fromSettings.length > 0 ? fromSettings : envBaseUrl;
	return base.replace(/\/+$/, "");
}

/** Joins a stored object key onto a CDN base, tolerating a leading slash on either side. */
export function buildAssetUrl(key: string, baseUrl: string): string {
	return `${baseUrl.replace(/\/+$/, "")}/${key.replace(/^\/+/, "")}`;
}
