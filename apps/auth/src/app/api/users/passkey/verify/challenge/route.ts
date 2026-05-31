import { NextResponse } from "next/server";
import { withApiContext } from "@/lib/context/with-api-context";
import { authenticateSessionOrBearerUser } from "@/lib/auth/authenticate-session-or-bearer-user";

// POST /api/users/passkey/verify/challenge — challenge to test ONE of the user's passkeys
// on the current device. Body: { id } (the passkey row id).
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

	const body = payload as { id?: unknown };
	if (typeof body.id !== "string" || body.id.trim().length === 0) {
		return NextResponse.json(
			{ error: "invalid_request", error_description: "id is required." },
			{ status: 400 }
		);
	}

	try {
		const { passkeyService } = getServices();
		const result = await passkeyService.generateAvailabilityChallenge(
			authResult.user.userId,
			body.id.trim()
		);
		if (!result) {
			return NextResponse.json(
				{ error: "not_found", error_description: "Passkey not found." },
				{ status: 404 }
			);
		}
		return NextResponse.json(result, { status: 200, headers: { "Cache-Control": "no-store" } });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unexpected error.";
		return NextResponse.json(
			{ error: "server_error", error_description: message },
			{ status: 500 }
		);
	}
});
