import { NextResponse } from "next/server";
import { withApiContext } from "@/lib/context/with-api-context";
import { authenticateSessionOrBearerUser } from "@/lib/auth/authenticate-session-or-bearer-user";
import type { RegistrationResponseJSON } from "@simplewebauthn/types";

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
	const authResult = await authenticateSessionOrBearerUser(req, getServices);
	if ("response" in authResult) {
		return authResult.response;
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
		const { passkeyService } = getServices();
		const credential = await passkeyService.verifyAndStoreRegistration(
			authResult.user.userId,
			body.challengeId.trim(),
			body.registrationResponse as RegistrationResponseJSON
		);
		return NextResponse.json(credential, { status: 201 });
	} catch (error) {
		return toErrorResponse(error);
	}
});
