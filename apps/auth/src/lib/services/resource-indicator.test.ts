import { describe, expect, it } from "vitest";

import { normalizeResourceParam } from "./resource-indicator";
import { OAuthServiceError } from "./oauth.types";

describe("normalizeResourceParam", () => {
	it("returns null for absent/blank input", () => {
		expect(normalizeResourceParam(null)).toBeNull();
		expect(normalizeResourceParam(undefined)).toBeNull();
		expect(normalizeResourceParam("   ")).toBeNull();
	});

	it("accepts an https resource URL and returns it trimmed", () => {
		expect(normalizeResourceParam("  https://mcp.example.com/mcp  ")).toBe("https://mcp.example.com/mcp");
	});

	it("allows http only for loopback hosts", () => {
		expect(normalizeResourceParam("http://localhost:8080/mcp")).toBe("http://localhost:8080/mcp");
		expect(normalizeResourceParam("http://127.0.0.1/mcp")).toBe("http://localhost/mcp");
		expect(normalizeResourceParam("http://[::1]:8080/mcp")).toBe("http://localhost:8080/mcp");
	});

	it("canonicalizes loopback hosts so /authorize and /token agree", () => {
		// /authorize reads `resource` from the query string, where Next.js rewrites 127.0.0.1 to
		// `localhost`; /token reads it from an untouched request body. Without canonicalizing both
		// sides the token exchange rejects its own code with invalid_target.
		const fromAuthorizeQuery = normalizeResourceParam("http://localhost:3000/mcp");
		const fromTokenBody = normalizeResourceParam("http://127.0.0.1:3000/mcp");
		expect(fromTokenBody).toBe(fromAuthorizeQuery);
	});

	it("re-serializes a loopback resource, so a pathless one gains a trailing slash", () => {
		// Canonicalizing has to run both spellings through the same serializer or they stop
		// comparing equal. The cost is this normalization, which lands in the token's `aud` —
		// but only ever for loopback resources, never for an https one.
		expect(normalizeResourceParam("http://localhost:3000")).toBe("http://localhost:3000/");
		expect(normalizeResourceParam("http://127.0.0.1:3000")).toBe("http://localhost:3000/");
	});

	it("leaves non-loopback resources byte-identical", () => {
		expect(normalizeResourceParam("https://mcp.example.com/mcp")).toBe(
			"https://mcp.example.com/mcp"
		);
		// No trailing slash introduced by a needless re-serialization.
		expect(normalizeResourceParam("https://mcp.example.com")).toBe("https://mcp.example.com");
	});

	it("rejects a non-URL", () => {
		expect(() => normalizeResourceParam("not-a-url")).toThrow(OAuthServiceError);
	});

	it("rejects a non-localhost http URL", () => {
		expect(() => normalizeResourceParam("http://mcp.example.com/mcp")).toThrow(
			"resource must be an https URL (http is allowed only for localhost)."
		);
	});

	it("rejects a resource with a fragment", () => {
		expect(() => normalizeResourceParam("https://mcp.example.com/mcp#frag")).toThrow(
			"resource must not contain a fragment."
		);
	});
});
