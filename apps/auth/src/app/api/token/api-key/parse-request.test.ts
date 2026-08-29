import { describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";

import { parseApiKeyRequest } from "./parse-request";

/** parseApiKeyRequest only touches headers and the body, so a plain Request suffices. */
function asNextRequest(req: Request): NextRequest {
	return req as unknown as NextRequest;
}

function formRequest(fields: Record<string, string>, headers: Record<string, string> = {}) {
	const body = new URLSearchParams(fields);
	return asNextRequest(
		new Request("https://auth.example/api/token/api-key", {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
			body,
		})
	);
}

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
	return asNextRequest(
		new Request("https://auth.example/api/token/api-key", {
			method: "POST",
			headers: { "content-type": "application/json", ...headers },
			body: JSON.stringify(body),
		})
	);
}

describe("parseApiKeyRequest", () => {
	it("reads a form-encoded body", async () => {
		const parsed = await parseApiKeyRequest(
			formRequest({ api_key: "eak_a_b", scope: "read", resource: "https://api.example" })
		);
		expect(parsed).toEqual({
			apiKey: "eak_a_b",
			scope: "read",
			resource: "https://api.example",
		});
	});

	it("reads a JSON body", async () => {
		const parsed = await parseApiKeyRequest(jsonRequest({ api_key: "eak_a_b", scope: "read" }));
		expect(parsed).toMatchObject({ apiKey: "eak_a_b", scope: "read" });
	});

	it("accepts the camelCase alias", async () => {
		const parsed = await parseApiKeyRequest(jsonRequest({ apiKey: "eak_a_b" }));
		expect(parsed.apiKey).toBe("eak_a_b");
	});

	it("reads a bearer header with no body at all", async () => {
		const req = asNextRequest(
			new Request("https://auth.example/api/token/api-key", {
				method: "POST",
				headers: { authorization: "Bearer eak_a_b" },
			})
		);
		expect(await parseApiKeyRequest(req)).toEqual({
			apiKey: "eak_a_b",
			scope: null,
			resource: null,
		});
	});

	it("prefers the bearer header over a body key, so the credential used is unambiguous", async () => {
		const parsed = await parseApiKeyRequest(
			formRequest({ api_key: "eak_from_body" }, { authorization: "Bearer eak_from_header" })
		);
		expect(parsed.apiKey).toBe("eak_from_header");
	});

	it("still finds a body key alongside a non-bearer Authorization header", async () => {
		const parsed = await parseApiKeyRequest(
			formRequest({ api_key: "eak_a_b" }, { authorization: "Basic Zm9vOmJhcg==" })
		);
		expect(parsed.apiKey).toBe("eak_a_b");
	});

	it("returns a null key rather than throwing on a malformed JSON body", async () => {
		const req = asNextRequest(
			new Request("https://auth.example/api/token/api-key", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "{not json",
			})
		);
		expect(await parseApiKeyRequest(req)).toEqual({ apiKey: null, scope: null, resource: null });
	});

	it("treats an empty api_key as absent", async () => {
		const parsed = await parseApiKeyRequest(formRequest({ api_key: "" }));
		expect(parsed.apiKey).toBeNull();
	});
});
