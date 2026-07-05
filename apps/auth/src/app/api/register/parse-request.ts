import { DcrServiceError, type DcrRegistrationRequest } from "@/lib/services/dcr.service";

/** Cap on redirect URIs a single dynamic registration may declare. */
const MAX_REDIRECT_URIS = 5;
const SUPPORTED_GRANT_TYPES = ["authorization_code", "refresh_token"] as const;
const SUPPORTED_RESPONSE_TYPES = ["code"] as const;
const SUPPORTED_AUTH_METHODS = ["none", "client_secret_basic", "client_secret_post"] as const;

function isValidRedirectUri(value: string): boolean {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return false;
	}
	// No wildcards, no fragment (RFC 7591 / OAuth 2.1 exact-match).
	if (url.hash) return false;
	const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
	return url.protocol === "https:" || (url.protocol === "http:" && isLocalhost);
}

function asStringArray(value: unknown): string[] | null {
	if (!Array.isArray(value)) return null;
	if (!value.every((v) => typeof v === "string")) return null;
	return value as string[];
}

/**
 * Decode and validate a raw JSON body into a typed {@link DcrRegistrationRequest} (RFC 7591).
 * This is the transport boundary: it enforces field shapes, formats, and supported enum
 * values, throwing {@link DcrServiceError} (mapped to HTTP 400 by the route) on any problem.
 * The service downstream only ever sees a well-formed request.
 */
export function parseDcrRegistrationRequest(body: unknown): DcrRegistrationRequest {
	if (typeof body !== "object" || body === null || Array.isArray(body)) {
		throw new DcrServiceError("invalid_client_metadata", "Request body must be a JSON object.", 400);
	}
	const req = body as Record<string, unknown>;

	// redirect_uris — required, exact-match https (http only for localhost), capped.
	const redirectUris = asStringArray(req.redirect_uris);
	if (!redirectUris || redirectUris.length === 0) {
		throw new DcrServiceError("invalid_redirect_uri", "redirect_uris is required and must be a non-empty array.", 400);
	}
	if (redirectUris.length > MAX_REDIRECT_URIS) {
		throw new DcrServiceError("invalid_redirect_uri", `At most ${MAX_REDIRECT_URIS} redirect_uris are allowed.`, 400);
	}
	for (const uri of redirectUris) {
		if (!isValidRedirectUri(uri)) {
			throw new DcrServiceError(
				"invalid_redirect_uri",
				`Invalid redirect_uri "${uri}": must be an https URL (http allowed only for localhost) with no fragment.`,
				400
			);
		}
	}

	// token_endpoint_auth_method — default "none" (public/PKCE, what MCP clients use).
	const tokenEndpointAuthMethod = req.token_endpoint_auth_method ?? "none";
	if (typeof tokenEndpointAuthMethod !== "string" || !SUPPORTED_AUTH_METHODS.includes(tokenEndpointAuthMethod as never)) {
		throw new DcrServiceError(
			"invalid_client_metadata",
			`Unsupported token_endpoint_auth_method. Supported: ${SUPPORTED_AUTH_METHODS.join(", ")}.`,
			400
		);
	}

	// grant_types — default authorization_code + refresh_token; must be a supported subset.
	const grantTypes = req.grant_types === undefined ? ["authorization_code", "refresh_token"] : asStringArray(req.grant_types);
	if (!grantTypes || !grantTypes.every((g) => SUPPORTED_GRANT_TYPES.includes(g as never))) {
		throw new DcrServiceError(
			"invalid_client_metadata",
			`Unsupported grant_types. Supported: ${SUPPORTED_GRANT_TYPES.join(", ")}.`,
			400
		);
	}

	// response_types — default ["code"]; only "code" is supported.
	const responseTypes = req.response_types === undefined ? ["code"] : asStringArray(req.response_types);
	if (!responseTypes || !responseTypes.every((r) => SUPPORTED_RESPONSE_TYPES.includes(r as never))) {
		throw new DcrServiceError("invalid_client_metadata", "Only response_type \"code\" is supported.", 400);
	}

	// client_name — optional string.
	const clientName = typeof req.client_name === "string" && req.client_name.trim().length > 0 ? req.client_name.trim() : null;

	// scope — optional space-delimited names (resolved to ids in the service).
	const scopeNames =
		typeof req.scope === "string"
			? Array.from(new Set(req.scope.split(/\s+/).map((s) => s.trim()).filter(Boolean)))
			: [];

	return { redirectUris, tokenEndpointAuthMethod, grantTypes, responseTypes, clientName, scopeNames };
}
