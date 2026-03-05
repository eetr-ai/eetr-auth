import { NextResponse } from "next/server";
import { withApiContext } from "@/lib/context/with-api-context";

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, OPTIONS",
} as const;

/** Respond to CORS preflight for /.well-known/oauth-authorization-server */
export const OPTIONS = () =>
	new NextResponse(null, { status: 204, headers: CORS_HEADERS });

/**
 * RFC 8414 OAuth 2.0 Authorization Server Metadata.
 * jwks_uri points to the R2 CDN (https://cdn.progression-ai.com/jwks.json).
 */
export const GET = withApiContext(async (_req, ctx) => {
	const env = ctx.env as { ISSUER_BASE_URL?: string; JWKS_CDN_BASE_URL?: string };
	const issuer = env.ISSUER_BASE_URL ?? "https://auth.progression-ai.com";
	const jwksCdnBase = env.JWKS_CDN_BASE_URL ?? "https://cdn.progression-ai.com";

	const metadata = {
		issuer,
		authorization_endpoint: `${issuer}/api/authorize`,
		token_endpoint: `${issuer}/api/token`,
		jwks_uri: `${jwksCdnBase}/jwks.json`,
		token_introspection_endpoint: `${issuer}/api/token/validate`,
		response_types_supported: ["code"],
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
