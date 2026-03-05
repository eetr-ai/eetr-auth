import { NextResponse } from "next/server";
import { withApiContext } from "../../../lib/context/with-api-context";

/**
 * OpenID Connect Discovery 1.0 (/.well-known/openid-configuration).
 * Same issuer and endpoints as OAuth metadata; jwks_uri points to the R2 CDN.
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
		response_types_supported: ["code"],
		scopes_supported: ["openid", "api"],
		subject_types_supported: ["public"],
		id_token_signing_alg_values_supported: ["RS256"],
		code_challenge_methods_supported: ["S256"],
	};

	return NextResponse.json(metadata, {
		headers: {
			"Cache-Control": "public, max-age=300",
			"Content-Type": "application/json",
		},
	});
});
