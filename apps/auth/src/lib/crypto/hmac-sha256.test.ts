import { describe, expect, it } from "vitest";
import { hmacSha256Hex, timingSafeEqualHex, timingSafeEqualUtf8 } from "@/lib/crypto/hmac-sha256";

describe("hmacSha256Hex", () => {
	it("returns the expected digest for a known message and key", async () => {
		await expect(hmacSha256Hex("hello world", "secret-key")).resolves.toBe(
			"095d5a21fe6d0646db223fdf3de6436bb8dfb2fab0b51677ecf6441fcf5f2a67"
		);
	});

	it("is deterministic for the same inputs", async () => {
		const [first, second] = await Promise.all([
			hmacSha256Hex("same-message", "same-key"),
			hmacSha256Hex("same-message", "same-key"),
		]);

		expect(first).toBe(second);
	});
});

describe("timingSafeEqualHex", () => {
	it("returns true for matching hex strings", () => {
		expect(
			timingSafeEqualHex(
				"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
				"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
			)
		).toBe(true);
	});

	it("returns false for different values or different lengths", () => {
		expect(
			timingSafeEqualHex(
				"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
				"1123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
			)
		).toBe(false);
		expect(timingSafeEqualHex("aa", "aaaa")).toBe(false);
	});

	it("returns false when one side is not valid hex", () => {
		expect(timingSafeEqualHex("zz", "00")).toBe(false);
	});
});

describe("timingSafeEqualUtf8", () => {
	it("returns true for identical utf8 strings and false otherwise", () => {
		expect(timingSafeEqualUtf8("pássword", "pássword")).toBe(true);
		expect(timingSafeEqualUtf8("pássword", "passw0rd")).toBe(false);
		expect(timingSafeEqualUtf8("abc", "ab")).toBe(false);
	});
});