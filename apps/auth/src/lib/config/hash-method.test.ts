import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveHashMethod } from "@/lib/config/hash-method";

describe("resolveHashMethod", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("defaults to argon (secure-by-default) when no hash method is configured", () => {
		expect(resolveHashMethod({})).toBe("argon");
	});

	it("defaults to argon for an unrecognized value (fail closed)", () => {
		expect(resolveHashMethod({ HASH_METHOD: "bcrypt" })).toBe("argon");
	});

	it("returns argon when explicitly configured in env", () => {
		expect(resolveHashMethod({ HASH_METHOD: "argon" })).toBe("argon");
	});

	it("falls back to process.env when Cloudflare env is not provided", () => {
		vi.stubEnv("HASH_METHOD", "ARGON");

		expect(resolveHashMethod()).toBe("argon");
	});

	it("allows an explicit md5 opt-in outside production", () => {
		vi.stubEnv("NODE_ENV", "development");
		expect(resolveHashMethod({ HASH_METHOD: "md5" })).toBe("md5");
	});

	it("refuses md5 in production", () => {
		vi.stubEnv("NODE_ENV", "production");
		expect(() => resolveHashMethod({ HASH_METHOD: "md5" })).toThrow(
			"HASH_METHOD=md5 is not allowed in production"
		);
	});
});