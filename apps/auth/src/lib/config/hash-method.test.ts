import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveHashMethod } from "@/lib/config/hash-method";

describe("resolveHashMethod", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("defaults to md5 when no hash method is configured", () => {
		expect(resolveHashMethod({})).toBe("md5");
	});

	it("returns argon when explicitly configured in env", () => {
		expect(resolveHashMethod({ HASH_METHOD: "argon" })).toBe("argon");
	});

	it("falls back to process.env when Cloudflare env is not provided", () => {
		vi.stubEnv("HASH_METHOD", "ARGON");

		expect(resolveHashMethod()).toBe("argon");
	});
});