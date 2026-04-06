import { NextResponse } from "next/server";
import { withApiContext } from "@/lib/context/with-api-context";
import type { RegistrationResponseJSON } from "@simplewebauthn/types";

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

function toErrorResponse(error: unknown) {
	const message = error instanceof Error ? error.message : "Unexpected error.";
	if (
		message === "Invalid or expired registration challenge." ||
		message === "Registration challenge has expired." ||
		message === "Passkey registration could not be verified."
	) {
		return NextResponse.json(
			{ error: "invalid_request", error_description: message },
			{ status: 400 }
		);
	}
	if (/unique constraint/i.test(message)) {
		return NextResponse.json(
			{ error: "conflict", error_description: "This passkey credential is already registered." },
			{ status: 409 }
		);
	}
	return NextResponse.json(
		{ error: "server_error", error_description: message },
		{ status: 500 }
	);
}

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

	let payload: unknown;
	try {
		payload = await req.json();
	} catch {
		return NextResponse.json(
			{ error: "invalid_request", error_description: "Request body must be valid JSON." },
			{ status: 400 }
		);
	}

	const body = payload as { challengeId?: unknown; registrationResponse?: unknown };

	if (typeof body.challengeId !== "string" || body.challengeId.trim().length === 0) {
		return NextResponse.json(
			{ error: "invalid_request", error_description: "challengeId is required." },
			{ status: 400 }
		);
	}
	if (!body.registrationResponse || typeof body.registrationResponse !== "object") {
		return NextResponse.json(
			{ error: "invalid_request", error_description: "registrationResponse is required." },
			{ status: 400 }
		);
	}

	try {
		const credential = await passkeyService.verifyAndStoreRegistration(
			validation.subject,
			body.challengeId.trim(),
			body.registrationResponse as RegistrationResponseJSON
		);
		return NextResponse.json(credential, { status: 201 });
	} catch (error) {
		return toErrorResponse(error);
	}
});
