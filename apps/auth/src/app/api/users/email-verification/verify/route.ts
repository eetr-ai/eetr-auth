import { NextResponse } from "next/server";
import { authenticateSessionOrBearerUser } from "@/lib/auth/authenticate-session-or-bearer-user";
import { withApiContext } from "@/lib/context/with-api-context";

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

	const body = payload as { challengeId?: unknown; code?: unknown };
	if (typeof body.challengeId !== "string" || body.challengeId.trim().length === 0) {
		return NextResponse.json(
			{ error: "invalid_request", error_description: "challengeId is required." },
			{ status: 400 }
		);
	}
	if (typeof body.code !== "string" || body.code.trim().length === 0) {
		return NextResponse.json(
			{ error: "invalid_request", error_description: "code is required." },
			{ status: 400 }
		);
	}

	const { userChallengeService } = getServices();
	const result = await userChallengeService.verifyEmailVerificationOtpAndConsume(
		body.challengeId.trim(),
		authResult.user.userId,
		body.code.trim()
	);
	if (!result.ok) {
		return NextResponse.json(
			{
				error: "invalid_request",
				error_description: `Email verification failed: ${result.reason}.`,
			},
			{ status: 400 }
		);
	}

	return NextResponse.json({ ok: true }, { status: 200 });
});