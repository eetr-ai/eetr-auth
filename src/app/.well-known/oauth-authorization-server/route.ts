import { NextResponse } from "next/server";
import { getCachedScopeNames } from "@/lib/cache/scope-discovery-cache";
import { withApiContext } from "@/lib/context/with-api-context";
import { resolveIssuerBaseUrl } from "@/lib/config/issuer-base-url";
import { resolveJwksCdnBaseUrl } from "@/lib/config/jwks-cdn-base-url";

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, OPTIONS",
} as const;

/** Respond to CORS preflight for /.well-known/oauth-authorization-server */
export const OPTIONS = () =>
	new NextResponse(null, { status: 204, headers: CORS_HEADERS });

/**
 * RFC 8414 OAuth 2.0 Authorization Server Metadata.
 * jwks_uri points to the public JWKS CDN (`JWKS_CDN_BASE_URL` / default).
 */
export const GET = withApiContext(async (_req, ctx, getServices) => {
	const env = ctx.env as { ISSUER_BASE_URL?: string; JWKS_CDN_BASE_URL?: string };
	const envRecord = env as Record<string, unknown>;
	const issuer = resolveIssuerBaseUrl(envRecord);
	const jwksCdnBase = resolveJwksCdnBaseUrl(envRecord);

	const { scopeService } = getServices();
	const scopesSupported = await getCachedScopeNames(() => scopeService.list());

	const metadata = {
		issuer,
		authorization_endpoint: `${issuer}/api/authorize`,
		token_endpoint: `${issuer}/api/token`,
		jwks_uri: `${jwksCdnBase}/jwks.json`,
		token_introspection_endpoint: `${issuer}/api/token/validate`,
		response_types_supported: ["code"],
		scopes_supported: scopesSupported,
		grant_types_supported: ["authorization_code", "client_credentials"],
		code_challenge_methods_supported: ["S256"],
	};

	return NextResponse.json(metadata, {
		headers: {
			"Cache-Control": "public, max-age=300",
			"Content-Type": "application/json",
			...CORS_HEADERS,
		},
	});
});
