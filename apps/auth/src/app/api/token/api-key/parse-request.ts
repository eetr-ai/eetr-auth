import type { NextRequest } from "next/server";

export interface ApiKeyRequest {
	apiKey: string | null;
	scope: string | null;
	resource: string | null;
}

function asString(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * The key may arrive as `Authorization: Bearer <key>` (the natural shape for a CI job that
 * already has a secret in an env var) or in the body. A bearer header wins so a caller that
 * sets both cannot be confused about which credential was actually used.
 *
 * Both form-encoded and JSON bodies are accepted: the OAuth token endpoint is form-only by
 * spec, but this endpoint has no such constraint and JSON is what most CI tooling reaches
 * for first.
 */
export async function parseApiKeyRequest(req: NextRequest): Promise<ApiKeyRequest> {
	const authorization = req.headers.get("authorization");
	const bearer = authorization?.startsWith("Bearer ")
		? authorization.slice("Bearer ".length).trim()
		: null;

	const contentType = req.headers.get("content-type") ?? "";
	let body: Record<string, unknown> = {};
	try {
		if (contentType.includes("application/json")) {
			body = (await req.json()) as Record<string, unknown>;
		} else {
			const form = await req.formData();
			body = Object.fromEntries(form.entries());
		}
	} catch {
		// A malformed or absent body is not fatal on its own -- the key may be in the header.
		body = {};
	}

	return {
		apiKey: bearer || asString(body.api_key) || asString(body.apiKey),
		scope: asString(body.scope),
		resource: asString(body.resource),
	};
}
