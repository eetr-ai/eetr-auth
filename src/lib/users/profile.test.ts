import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_JWKS_CDN_BASE_URL } from "@/lib/config/jwks-cdn-base-url";
import { getAvatarCdnBaseUrl, getAvatarUrl, normalizeOptionalProfileField } from "@/lib/users/profile";

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

describe("getAvatarUrl", () => {
	it("returns null when no avatar key is present", () => {
		expect(getAvatarUrl(null, {})).toBeNull();
	});

	it("joins the CDN base URL with a normalized avatar key", () => {
		expect(getAvatarUrl("/users/avatar.png", { AVATAR_CDN_BASE_URL: "https://avatars.example.com" })).toBe(
			"https://avatars.example.com/users/avatar.png"
		);
	});
});