import { afterEach, describe, expect, it, vi } from "vitest";

import { getAuthSecret } from "@/lib/auth/auth-secret";

describe("getAuthSecret", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("returns AUTH_SECRET when it is set", () => {
		vi.stubEnv("AUTH_SECRET", "auth-secret-value");
		vi.stubEnv("NEXTAUTH_SECRET", "nextauth-secret-value");

		expect(getAuthSecret()).toBe("auth-secret-value");
	});

	it("falls back to NEXTAUTH_SECRET when AUTH_SECRET is missing", () => {
		vi.stubEnv("AUTH_SECRET", "");
		vi.stubEnv("NEXTAUTH_SECRET", "nextauth-secret-value");

		expect(getAuthSecret()).toBe("nextauth-secret-value");
	});

	it("throws when neither secret is configured", () => {
		vi.stubEnv("AUTH_SECRET", "");
		vi.stubEnv("NEXTAUTH_SECRET", "");

		expect(() => getAuthSecret()).toThrow("AUTH_SECRET (or NEXTAUTH_SECRET) is not configured.");
	});
});
