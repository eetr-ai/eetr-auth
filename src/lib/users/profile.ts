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

export function getAvatarUrl(avatarKey: string | null | undefined, env: Record<string, unknown>): string | null {
	if (!avatarKey) return null;
	const normalizedKey = avatarKey.replace(/^\/+/, "");
	return `${getAvatarCdnBaseUrl(env)}/${normalizedKey}`;
}
