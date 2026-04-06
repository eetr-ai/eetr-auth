import { NextResponse } from "next/server";
import { withApiContext } from "@/lib/context/with-api-context";

function parseBearerToken(authorizationHeader: string | null): string | null {
	if (!authorizationHeader) return null;
	const [scheme, value] = authorizationHeader.split(" ");
	if (!scheme || !value) return null;
	if (scheme.toLowerCase() !== "bearer") return null;
	const token = value.trim();
	return token.length > 0 ? token : null;
}

function isLikelyJwt(token: string): boolean {
	const parts = token.split(".");
	return parts.length === 3 && parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part));
}

const UNAUTHORIZED = (description: string) =>
	NextResponse.json(
		{ error: "invalid_token", error_description: description },
		{ status: 401, headers: { "Cache-Control": "no-store" } }
	);

export const POST = withApiContext(async (req, _ctx, getServices) => {
	const token = parseBearerToken(req.headers.get("authorization"));
	if (!token || !isLikelyJwt(token)) {
		return UNAUTHORIZED("A valid JWT access token is required.");
	}

	const { oauthTokenService, passkeyService } = getServices();
	const validation = await oauthTokenService.validateAccessToken(token, [], null);

	if (!validation.valid || !validation.subject) {
		return UNAUTHORIZED("Invalid or expired access token.");
	}

	try {
		const result = await passkeyService.generateRegistrationChallenge(validation.subject);
		return NextResponse.json(result, {
			status: 200,
			headers: { "Cache-Control": "no-store" },
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unexpected error.";
		return NextResponse.json(
			{ error: "server_error", error_description: message },
			{ status: 500 }
		);
	}
});
