import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_JWKS_CDN_BASE_URL } from "@/lib/config/jwks-cdn-base-url";
import {
	getAvatarCdnBaseUrl,
	pickAssetCdnBaseUrl,
	resolveAvatarUrl,
	normalizeOptionalProfileField,
} from "@/lib/users/profile";

describe("normalizeOptionalProfileField", () => {
	it("trims non-empty values and converts empty values to null", () => {
		expect(normalizeOptionalProfileField("  Jane Doe  ")).toBe("Jane Doe");
		expect(normalizeOptionalProfileField("   ")).toBeNull();
		expect(normalizeOptionalProfileField(undefined)).toBeNull();
	});
});

describe("getAvatarCdnBaseUrl", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("uses AVATAR_CDN_BASE_URL when present", () => {
		expect(getAvatarCdnBaseUrl({ AVATAR_CDN_BASE_URL: "https://avatars.example.com///" })).toBe(
			"https://avatars.example.com"
		);
	});

	it("falls back to the JWKS CDN base URL", () => {
		expect(getAvatarCdnBaseUrl({ JWKS_CDN_BASE_URL: "https://cdn.example.com//" })).toBe(
			"https://cdn.example.com"
		);
		expect(getAvatarCdnBaseUrl({})).toBe(DEFAULT_JWKS_CDN_BASE_URL);
	});
});

describe("pickAssetCdnBaseUrl", () => {
	it("prefers the site setting over the environment default", () => {
		// The setting is the operator-facing control; the env var is only the
		// deploy-time default it overrides.
		expect(pickAssetCdnBaseUrl("https://cdn.site.example//", "https://env.example")).toBe(
			"https://cdn.site.example"
		);
	});

	it("falls back to the environment when the setting is unset or blank", () => {
		expect(pickAssetCdnBaseUrl(null, "https://env.example/")).toBe("https://env.example");
		expect(pickAssetCdnBaseUrl("   ", "https://env.example")).toBe("https://env.example");
		expect(pickAssetCdnBaseUrl(undefined, "https://env.example")).toBe("https://env.example");
	});
});

describe("resolveAvatarUrl", () => {
	it("returns null when no avatar key is present", () => {
		expect(resolveAvatarUrl(null, null, {})).toBeNull();
	});

	it("joins the CDN base URL with a normalized avatar key", () => {
		expect(
			resolveAvatarUrl("/users/avatar.png", null, {
				AVATAR_CDN_BASE_URL: "https://avatars.example.com",
			})
		).toBe("https://avatars.example.com/users/avatar.png");
	});

	it("uses the site CDN URL over the environment", () => {
		// The bug this guards: avatars resolved from env only, so the logo and the
		// avatars could point at different hosts.
		expect(
			resolveAvatarUrl("avatars/u1.png", "https://cdn.site.example", {
				AVATAR_CDN_BASE_URL: "https://avatars.example.com",
			})
		).toBe("https://cdn.site.example/avatars/u1.png");
	});
});