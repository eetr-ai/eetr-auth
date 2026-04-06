import { NextResponse } from "next/server";
import { withApiContext } from "@/lib/context/with-api-context";
import type { AuthenticationResponseJSON } from "@simplewebauthn/types";

function toErrorResponse(error: unknown) {
	const message = error instanceof Error ? error.message : "Unexpected error.";
	if (
		message === "Invalid or expired authentication challenge." ||
		message === "Authentication challenge has expired." ||
		message === "Passkey not found." ||
		message === "Passkey authentication could not be verified."
	) {
		return NextResponse.json(
			{ error: "invalid_request", error_description: message },
			{ status: 400, headers: { "Cache-Control": "no-store" } }
		);
	}
	return NextResponse.json(
		{ error: "server_error", error_description: message },
		{ status: 500, headers: { "Cache-Control": "no-store" } }
	);
}

export const POST = withApiContext(async (req, _ctx, getServices) => {
	let payload: unknown;
	try {
		payload = await req.json();
	} catch {
		return NextResponse.json(
			{ error: "invalid_request", error_description: "Request body must be valid JSON." },
			{ status: 400 }
		);
	}

	const body = payload as { challengeId?: unknown; authenticationResponse?: unknown };

	if (typeof body.challengeId !== "string" || body.challengeId.trim().length === 0) {
		return NextResponse.json(
			{ error: "invalid_request", error_description: "challengeId is required." },
			{ status: 400 }
		);
	}
	if (!body.authenticationResponse || typeof body.authenticationResponse !== "object") {
		return NextResponse.json(
			{ error: "invalid_request", error_description: "authenticationResponse is required." },
			{ status: 400 }
		);
	}

	try {
		const { passkeyService } = getServices();
		const { exchangeToken } = await passkeyService.verifyAuthentication(
			body.challengeId.trim(),
			body.authenticationResponse as AuthenticationResponseJSON
		);
		return NextResponse.json(
			{ exchangeToken },
			{ status: 200, headers: { "Cache-Control": "no-store" } }
		);
	} catch (error) {
		return toErrorResponse(error);
	}
});
