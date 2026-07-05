import { NextResponse } from "next/server";
import { withApiContext } from "@/lib/context/with-api-context";
import { corsPreflight, noStoreCorsHeaders } from "@/lib/http/cors";
import { buildUserInfoClaims } from "@/lib/users/userinfo-claims";

// UserInfo is called from browser-based OIDC clients with a bearer token, so allow CORS.
const NO_STORE_HEADERS = noStoreCorsHeaders("GET, OPTIONS");

/** Respond to CORS preflight for /api/userinfo. */
export const OPTIONS = corsPreflight("GET, OPTIONS");

function parseBearerToken(authorizationHeader: string | null): string | null {
	if (!authorizationHeader) return null;
	const [scheme, value] = authorizationHeader.split(" ");
	if (!scheme || !value) return null;
	if (scheme.toLowerCase() !== "bearer") return null;
	const token = value.trim();
	return token.length > 0 ? token : null;
}

export const GET = withApiContext(async (req, ctx, getServices) => {
	const token = parseBearerToken(req.headers.get("authorization"));
	if (!token) {
		return NextResponse.json(
			{ error: "invalid_token", error_description: "A valid access token is required." },
			{
				status: 401,
				headers: NO_STORE_HEADERS,
			}
		);
	}
	const { oauthTokenService, userService } = getServices();
	// UserInfo is an OIDC endpoint: require the `openid` scope to access it at all.
	const validation = await oauthTokenService.validateAccessToken(token, ["openid"], null);

	if (!validation.valid || !validation.subject) {
		// Distinguish "token is fine but lacks openid" (403 insufficient_scope) from a
		// missing/expired/invalid token (401), per RFC 6750.
		const insufficientScope = validation.active && validation.missingScopes.length > 0;
		return NextResponse.json(
			insufficientScope
				? { error: "insufficient_scope", error_description: "The openid scope is required." }
				: { error: "invalid_token", error_description: "Invalid or missing access token." },
			{
				status: insufficientScope ? 403 : 401,
				headers: {
					...NO_STORE_HEADERS,
					"WWW-Authenticate": insufficientScope
						? 'Bearer error="insufficient_scope", scope="openid"'
						: 'Bearer error="invalid_token"',
				},
			}
		);
	}

	const user = await userService.getById(validation.subject);
	if (!user) {
		return NextResponse.json(
			{ error: "invalid_token", error_description: "Token subject user not found." },
			{
				status: 401,
				headers: NO_STORE_HEADERS,
			}
		);
	}

	// Data minimization: only return claims the token was actually granted.
	const env = ctx.env as unknown as Record<string, unknown>;
	const claims = buildUserInfoClaims(user, validation.tokenScopes, env);

	return NextResponse.json(claims, {
		status: 200,
		headers: {
			"Cache-Control": "no-store",
			Pragma: "no-cache",
		},
	});
});
