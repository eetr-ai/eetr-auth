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

	it("allows http only for localhost / 127.0.0.1", () => {
		expect(normalizeResourceParam("http://localhost:8080/mcp")).toBe("http://localhost:8080/mcp");
		expect(normalizeResourceParam("http://127.0.0.1/mcp")).toBe("http://127.0.0.1/mcp");
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
