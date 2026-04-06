import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveMfaOtpMaxAttempts } from "@/lib/config/mfa-otp-max-attempts";

describe("resolveMfaOtpMaxAttempts", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("defaults to 5 when unset", () => {
		expect(resolveMfaOtpMaxAttempts({})).toBe(5);
	});

	it("parses a numeric string from env", () => {
		expect(resolveMfaOtpMaxAttempts({ MFA_OTP_MAX_ATTEMPTS: "7" })).toBe(7);
	});

	it("falls back to 5 for invalid or too-small values", () => {
		expect(resolveMfaOtpMaxAttempts({ MFA_OTP_MAX_ATTEMPTS: "0" })).toBe(5);
		expect(resolveMfaOtpMaxAttempts({ MFA_OTP_MAX_ATTEMPTS: "not-a-number" })).toBe(5);
	});

	it("uses process.env when Cloudflare env is absent", () => {
		vi.stubEnv("MFA_OTP_MAX_ATTEMPTS", "9");

		expect(resolveMfaOtpMaxAttempts()).toBe(9);
	});
});