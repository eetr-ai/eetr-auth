import { NextResponse } from "next/server";
import { authenticateSessionOrBearerUser } from "@/lib/auth/authenticate-session-or-bearer-user";
import { withApiContext } from "@/lib/context/with-api-context";

function toErrorResponse(error: unknown) {
	const message = error instanceof Error ? error.message : "Unexpected error.";
	if (message === "User not found") {
		return NextResponse.json(
			{ error: "not_found", error_description: message },
			{ status: 404 }
		);
	}
	if (message === "Your account has no email address; email verification cannot be used.") {
		return NextResponse.json(
			{ error: "invalid_request", error_description: message },
			{ status: 400 }
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

	try {
		const { userChallengeService } = getServices();
		const challengeId = await userChallengeService.requestEmailVerification(authResult.user.userId);
		return NextResponse.json({ ok: true, challengeId }, { status: 200 });
	} catch (error) {
		return toErrorResponse(error);
	}
});