import { describe, expect, it } from "vitest";

import { parseDcrRegistrationRequest } from "./parse-request";
import { isDcrServiceError } from "@/lib/services/dcr.service";

function expectRejection(body: unknown, code: string) {
	try {
		parseDcrRegistrationRequest(body);
	} catch (error) {
		expect(isDcrServiceError(error)).toBe(true);
		expect((error as { code: string }).code).toBe(code);
		return;
	}
	throw new Error("expected parseDcrRegistrationRequest to throw");
}

describe("parseDcrRegistrationRequest", () => {
	it("parses a minimal public registration with defaults", () => {
		const parsed = parseDcrRegistrationRequest({ redirect_uris: ["https://claude.ai/cb"] });
		expect(parsed).toEqual({
			redirectUris: ["https://claude.ai/cb"],
			tokenEndpointAuthMethod: "none",
			grantTypes: ["authorization_code", "refresh_token"],
			responseTypes: ["code"],
			clientName: null,
			scopeNames: [],
		});
	});

	it("parses supplied metadata and de-dupes scope names", () => {
		const parsed = parseDcrRegistrationRequest({
			client_name: "  Test MCP  ",
			redirect_uris: ["https://claude.ai/cb"],
			token_endpoint_auth_method: "client_secret_basic",
			grant_types: ["authorization_code"],
			response_types: ["code"],
			scope: "openid profile openid",
		});
		expect(parsed.clientName).toBe("Test MCP");
		expect(parsed.tokenEndpointAuthMethod).toBe("client_secret_basic");
		expect(parsed.grantTypes).toEqual(["authorization_code"]);
		expect(parsed.scopeNames).toEqual(["openid", "profile"]);
	});

	it("allows http://localhost redirect URIs", () => {
		const parsed = parseDcrRegistrationRequest({ redirect_uris: ["http://localhost:8080/cb"] });
		expect(parsed.redirectUris).toEqual(["http://localhost:8080/cb"]);
	});

	it("rejects a non-object body", () => {
		expectRejection("not-an-object", "invalid_client_metadata");
		expectRejection([{ redirect_uris: ["https://a/cb"] }], "invalid_client_metadata");
		expectRejection(null, "invalid_client_metadata");
	});

	it("rejects missing or empty redirect_uris", () => {
		expectRejection({ client_name: "x" }, "invalid_redirect_uri");
		expectRejection({ redirect_uris: [] }, "invalid_redirect_uri");
		expectRejection({ redirect_uris: "https://a/cb" }, "invalid_redirect_uri");
	});

	it("rejects an http redirect_uri that is not localhost", () => {
		expectRejection({ redirect_uris: ["http://evil.example.com/cb"] }, "invalid_redirect_uri");
		expectRejection({ redirect_uris: ["http://localhost.evil.com/cb"] }, "invalid_redirect_uri");
		expectRejection({ redirect_uris: ["http://126.0.0.1/cb"] }, "invalid_redirect_uri");
		expectRejection({ redirect_uris: ["http://192.168.0.5/cb"] }, "invalid_redirect_uri");
	});

	it("accepts every RFC 8252 loopback spelling over http", () => {
		// Native MCP clients bind an ephemeral loopback port and spell the host inconsistently.
		for (const uri of [
			"http://localhost:6274/oauth/callback",
			"http://127.0.0.1:57162/callback/abc",
			"http://127.0.0.2:8080/cb",
			"http://[::1]:57162/cb",
		]) {
			expect(parseDcrRegistrationRequest({ redirect_uris: [uri] }).redirectUris).toEqual([uri]);
		}
	});

	it("rejects a redirect_uri with a fragment", () => {
		expectRejection({ redirect_uris: ["https://a.example.com/cb#frag"] }, "invalid_redirect_uri");
	});

	it("rejects more than the max redirect URIs", () => {
		const uris = Array.from({ length: 6 }, (_, i) => `https://c${i}.example.com/cb`);
		expectRejection({ redirect_uris: uris }, "invalid_redirect_uri");
	});

	it("rejects an unsupported token_endpoint_auth_method", () => {
		expectRejection(
			{ redirect_uris: ["https://a.example.com/cb"], token_endpoint_auth_method: "private_key_jwt" },
			"invalid_client_metadata"
		);
	});

	it("rejects unsupported grant_types and response_types", () => {
		expectRejection(
			{ redirect_uris: ["https://a.example.com/cb"], grant_types: ["client_credentials"] },
			"invalid_client_metadata"
		);
		expectRejection(
			{ redirect_uris: ["https://a.example.com/cb"], response_types: ["token"] },
			"invalid_client_metadata"
		);
	});
});
