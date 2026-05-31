import { describe, expect, it } from "vitest";

import {
	base32Decode,
	base32Encode,
	buildOtpauthUri,
	generateSecret,
	totpCodeAt,
	verifyTotp,
} from "@/lib/auth/totp";

// RFC 6238 test secret (ASCII "12345678901234567890") encoded as base32.
const RFC_SECRET = base32Encode(new TextEncoder().encode("12345678901234567890"));

describe("base32", () => {
	it("round-trips arbitrary bytes", () => {
		const bytes = new Uint8Array([0, 1, 2, 250, 255, 128, 64, 7, 99]);
		expect([...base32Decode(base32Encode(bytes))]).toEqual([...bytes]);
	});

	it("ignores whitespace and casing when decoding", () => {
		const upper = base32Encode(new TextEncoder().encode("hello"));
		const noisy = upper.toLowerCase().replace(/(.{2})/g, "$1 ");
		expect([...base32Decode(noisy)]).toEqual([...base32Decode(upper)]);
	});

	it("throws on an invalid base32 character", () => {
		expect(() => base32Decode("0189!")).toThrow(/invalid base32/i);
	});
});

describe("totpCodeAt (RFC 6238 vectors, SHA-1, 6 digits)", () => {
	it("matches the vector at T=59 (step 1)", async () => {
		expect(await totpCodeAt(RFC_SECRET, Math.floor(59 / 30))).toBe("287082");
	});

	it("matches the vector at T=1111111109 (step 37037036)", async () => {
		expect(await totpCodeAt(RFC_SECRET, Math.floor(1111111109 / 30))).toBe("081804");
	});
});

describe("verifyTotp", () => {
	// Pin time so the window assertions are deterministic. nowMs=60000 -> step 2.
	const nowMs = 60_000;

	it("accepts the exact-step code", async () => {
		const code = await totpCodeAt(RFC_SECRET, 2);
		expect(await verifyTotp(RFC_SECRET, code, { nowMs })).toBe(true);
	});

	it("accepts codes within ±1 step (clock skew)", async () => {
		expect(await verifyTotp(RFC_SECRET, await totpCodeAt(RFC_SECRET, 1), { nowMs })).toBe(true);
		expect(await verifyTotp(RFC_SECRET, await totpCodeAt(RFC_SECRET, 3), { nowMs })).toBe(true);
	});

	it("rejects codes more than one step away", async () => {
		expect(await verifyTotp(RFC_SECRET, await totpCodeAt(RFC_SECRET, 0), { nowMs })).toBe(false);
		expect(await verifyTotp(RFC_SECRET, await totpCodeAt(RFC_SECRET, 4), { nowMs })).toBe(false);
	});

	it("rejects malformed (non 6-digit) input", async () => {
		expect(await verifyTotp(RFC_SECRET, "12345", { nowMs })).toBe(false);
		expect(await verifyTotp(RFC_SECRET, "abcdef", { nowMs })).toBe(false);
		expect(await verifyTotp(RFC_SECRET, "1234567", { nowMs })).toBe(false);
	});
});

describe("generateSecret", () => {
	it("produces a 32-char base32 string (20 random bytes) using only the base32 alphabet", () => {
		const secret = generateSecret();
		expect(secret).toMatch(/^[A-Z2-7]{32}$/);
	});

	it("is non-deterministic", () => {
		expect(generateSecret()).not.toBe(generateSecret());
	});
});

describe("buildOtpauthUri", () => {
	it("builds a scannable otpauth URI with issuer, account, and parameters", () => {
		const uri = buildOtpauthUri({ secret: "ABC123", accountName: "alice@example.com", issuer: "Eetr Auth" });
		expect(uri.startsWith("otpauth://totp/")).toBe(true);
		expect(uri).toContain(encodeURIComponent("Eetr Auth:alice@example.com"));
		expect(uri).toContain("secret=ABC123");
		expect(uri).toContain("algorithm=SHA1");
		expect(uri).toContain("digits=6");
		expect(uri).toContain("period=30");
		expect(uri).toContain(`issuer=${encodeURIComponent("Eetr Auth")}`);
	});
});
