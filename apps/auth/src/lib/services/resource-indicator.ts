import { OAuthServiceError } from "./oauth.types";

/**
 * RFC 8707 Resource Indicators. The `resource` parameter names the protected resource
 * (audience) an access token is intended for. We accept any absolute `https://` URL (plus
 * `http://localhost` / `http://127.0.0.1` for local MCP development) and echo it into the
 * token's `aud`. A resource server only accepts tokens whose `aud` equals its own URL, so a
 * token minted for a different resource is useless elsewhere — no allowlist is required.
 *
 * Returns the normalized resource string, or null when none was supplied. Throws
 * `invalid_target` (RFC 8707 §2) for a malformed resource.
 */
export function normalizeResourceParam(resource: string | null | undefined): string | null {
	const trimmed = resource?.trim();
	if (!trimmed) return null;

	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		throw new OAuthServiceError("invalid_target", "resource must be an absolute URI.", 400);
	}

	// RFC 8707 §2: the resource URI MUST NOT include a fragment component.
	if (url.hash) {
		throw new OAuthServiceError("invalid_target", "resource must not contain a fragment.", 400);
	}

	const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
	const schemeOk = url.protocol === "https:" || (url.protocol === "http:" && isLocalhost);
	if (!schemeOk) {
		throw new OAuthServiceError(
			"invalid_target",
			"resource must be an https URL (http is allowed only for localhost).",
			400
		);
	}

	return trimmed;
}
