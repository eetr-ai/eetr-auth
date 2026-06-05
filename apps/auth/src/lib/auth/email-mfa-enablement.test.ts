import { describe, expect, it } from "vitest";
import { isEmailMfaGloballyEnabled } from "@/lib/auth/email-mfa-enablement";

const KEY = "re_test_key";

describe("isEmailMfaGloballyEnabled", () => {
	it("is enabled when the toggle is on and Site URL + Resend key are set", () => {
		expect(
			isEmailMfaGloballyEnabled({ mfaEnabled: true, siteUrl: "https://auth.example.com" }, KEY)
		).toBe(true);
	});

	it("is disabled when the toggle is off (even with URL and key)", () => {
		expect(
			isEmailMfaGloballyEnabled({ mfaEnabled: false, siteUrl: "https://auth.example.com" }, KEY)
		).toBe(false);
	});

	it("is disabled when no Site URL is configured (no link target)", () => {
		expect(isEmailMfaGloballyEnabled({ mfaEnabled: true, siteUrl: null }, KEY)).toBe(false);
	});

	it("is disabled when no Resend key is configured (cannot send a code)", () => {
		expect(
			isEmailMfaGloballyEnabled({ mfaEnabled: true, siteUrl: "https://auth.example.com" }, undefined)
		).toBe(false);
	});

	it("treats a whitespace-only Site URL as unconfigured", () => {
		expect(isEmailMfaGloballyEnabled({ mfaEnabled: true, siteUrl: "   " }, KEY)).toBe(false);
	});

	it("treats a whitespace-only Resend key as unconfigured", () => {
		expect(
			isEmailMfaGloballyEnabled({ mfaEnabled: true, siteUrl: "https://auth.example.com" }, "   ")
		).toBe(false);
	});

	it("ignores surrounding whitespace on otherwise valid values", () => {
		expect(
			isEmailMfaGloballyEnabled(
				{ mfaEnabled: true, siteUrl: "  https://auth.example.com  " },
				`  ${KEY}  `
			)
		).toBe(true);
	});

	it("returns false for a null site row (settings not yet initialized)", () => {
		expect(isEmailMfaGloballyEnabled(null, KEY)).toBe(false);
	});

	it("returns false for an undefined site row", () => {
		expect(isEmailMfaGloballyEnabled(undefined, KEY)).toBe(false);
	});

	it("always returns a boolean, never a falsy passthrough", () => {
		// `mfaEnabled` short-circuits to a literal false rather than leaking the operand.
		const result = isEmailMfaGloballyEnabled({ mfaEnabled: false, siteUrl: null }, undefined);
		expect(result).toBe(false);
		expect(typeof result).toBe("boolean");
	});
});
