import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	collectPendingAuthorizationParams,
	decodePendingAuthorizationCookie,
	encodePendingAuthorizationCookie,
	getPendingCookieName,
	getPendingCookieTtlSeconds,
} from "@/lib/auth/oauth-pending-cookie";

const TEST_SECRET = "test-oauth-pending-secret-value";

describe("oauth-pending-cookie", () => {
	beforeEach(() => {
		vi.stubEnv("OAUTH_PENDING_SECRET", TEST_SECRET);
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-07T12:00:00.000Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllEnvs();
	});

	describe("getPendingCookieName", () => {
		it("returns the correct cookie name", () => {
			expect(getPendingCookieName()).toBe("oauth_pending");
		});
	});

	describe("getPendingCookieTtlSeconds", () => {
		it("returns 300", () => {
			expect(getPendingCookieTtlSeconds()).toBe(300);
		});
	});

	describe("collectPendingAuthorizationParams", () => {
		it("collects known params from URLSearchParams", () => {
			const sp = new URLSearchParams({
				response_type: "code",
				client_id: "my-client",
				unknown_param: "ignored",
			});
			expect(collectPendingAuthorizationParams(sp)).toEqual({
				response_type: "code",
				client_id: "my-client",
			});
		});

		it("trims and skips empty values from URLSearchParams", () => {
			const sp = new URLSearchParams({ response_type: "   ", client_id: "my-client" });
			expect(collectPendingAuthorizationParams(sp)).toEqual({ client_id: "my-client" });
		});

		it("collects all known param keys from FormData", () => {
			const fd = new FormData();
			fd.set("response_type", "code");
			fd.set("scope", "openid profile");
			fd.set("code_challenge", "abc123");
			fd.set("extra_field", "ignored");
			expect(collectPendingAuthorizationParams(fd)).toEqual({
				response_type: "code",
				scope: "openid profile",
				code_challenge: "abc123",
			});
		});

		it("returns an empty object when no known params are present", () => {
			const sp = new URLSearchParams({ foo: "bar" });
			expect(collectPendingAuthorizationParams(sp)).toEqual({});
		});
	});

	describe("encodePendingAuthorizationCookie", () => {
		it("returns a string with exactly one dot separator", async () => {
			const encoded = await encodePendingAuthorizationCookie({ client_id: "x" });
			const parts = encoded.split(".");
			expect(parts).toHaveLength(2);
			expect(parts[0]).toBeTruthy();
			expect(parts[1]).toBeTruthy();
		});

		it("strips unknown keys and empty values from params", async () => {
			const encoded = await encodePendingAuthorizationCookie({
				client_id: "x",
				// @ts-expect-error intentionally passing unknown key
				unknown_key: "y",
				scope: "   ",
			});
			const decoded = await decodePendingAuthorizationCookie(encoded);
			expect(decoded).toEqual({ client_id: "x" });
		});
	});

	describe("decodePendingAuthorizationCookie", () => {
		it("returns null for null input", async () => {
			expect(await decodePendingAuthorizationCookie(null)).toBeNull();
		});

		it("returns null for undefined input", async () => {
			expect(await decodePendingAuthorizationCookie(undefined)).toBeNull();
		});

		it("returns null for an empty string", async () => {
			expect(await decodePendingAuthorizationCookie("")).toBeNull();
		});

		it("returns null when there is no dot separator", async () => {
			expect(await decodePendingAuthorizationCookie("payloadwithnoseparator")).toBeNull();
		});

		it("returns null when the payload part is missing", async () => {
			expect(await decodePendingAuthorizationCookie(".signatureonly")).toBeNull();
		});

		it("returns null when the signature part is missing", async () => {
			expect(await decodePendingAuthorizationCookie("payloadonly.")).toBeNull();
		});

		it("returns null for a tampered signature", async () => {
			const encoded = await encodePendingAuthorizationCookie({ client_id: "x" });
			const [payload] = encoded.split(".");
			const tampered = `${payload}.invalidsignature`;
			expect(await decodePendingAuthorizationCookie(tampered)).toBeNull();
		});

		it("returns null for an expired cookie", async () => {
			const encoded = await encodePendingAuthorizationCookie({ client_id: "x" });
			// Advance past the 300s TTL
			vi.setSystemTime(new Date("2026-04-07T12:06:00.000Z"));
			expect(await decodePendingAuthorizationCookie(encoded)).toBeNull();
		});

		it("returns null for a cookie with a tampered (non-JSON) payload", async () => {
			// Craft a value that passes the split check but has garbage payload
			expect(await decodePendingAuthorizationCookie("bm90anNvbg.fakesig")).toBeNull();
		});
	});

	describe("round-trip", () => {
		it("encodes and decodes all known param keys", async () => {
			const params = {
				response_type: "code",
				client_id: "my-client",
				redirect_uri: "https://example.com/callback",
				scope: "openid profile email",
				state: "random-state-value",
				code_challenge: "s256-challenge",
				code_challenge_method: "S256",
			};
			const encoded = await encodePendingAuthorizationCookie(params);
			const decoded = await decodePendingAuthorizationCookie(encoded);
			expect(decoded).toEqual(params);
		});

		it("trims whitespace from param values during encode", async () => {
			const encoded = await encodePendingAuthorizationCookie({
				client_id: "  my-client  ",
				scope: " openid ",
			});
			const decoded = await decodePendingAuthorizationCookie(encoded);
			expect(decoded).toEqual({ client_id: "my-client", scope: "openid" });
		});

		it("uses NEXTAUTH_SECRET as fallback when OAUTH_PENDING_SECRET is unset", async () => {
			vi.unstubAllEnvs();
			vi.stubEnv("NEXTAUTH_SECRET", "nextauth-fallback-secret");

			const encoded = await encodePendingAuthorizationCookie({ client_id: "x" });
			const decoded = await decodePendingAuthorizationCookie(encoded);
			expect(decoded).toEqual({ client_id: "x" });
		});

		it("throws when neither secret env var is set", async () => {
			vi.unstubAllEnvs();
			await expect(encodePendingAuthorizationCookie({ client_id: "x" })).rejects.toThrow(
				"Missing OAUTH_PENDING_SECRET"
			);
		});
	});
});
