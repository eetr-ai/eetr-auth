import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ISSUER_BASE_URL, resolveIssuerBaseUrl } from "@/lib/config/issuer-base-url";

describe("resolveIssuerBaseUrl", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("defaults to the configured fallback issuer", () => {
		vi.stubEnv("ISSUER_BASE_URL", " ");

		expect(resolveIssuerBaseUrl({})).toBe(DEFAULT_ISSUER_BASE_URL);
	});

	it("prefers the provided env value and strips trailing slashes", () => {
		expect(resolveIssuerBaseUrl({ ISSUER_BASE_URL: " https://issuer.example.com/// " })).toBe(
			"https://issuer.example.com"
		);
	});

	it("uses process.env when Cloudflare env is absent", () => {
		vi.stubEnv("ISSUER_BASE_URL", "https://process.example.com//");

		expect(resolveIssuerBaseUrl()).toBe("https://process.example.com");
	});
});