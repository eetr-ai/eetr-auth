import { NextResponse } from "next/server";
import { withApiContext } from "@/lib/context/with-api-context";
import { authenticateSessionOrBearerUser } from "@/lib/auth/authenticate-session-or-bearer-user";

export const POST = withApiContext(async (req, _ctx, getServices) => {
	const authResult = await authenticateSessionOrBearerUser(req, getServices);
	if ("response" in authResult) {
		return authResult.response;
	}

	try {
		const { passkeyService } = getServices();
		const result = await passkeyService.generateRegistrationChallenge(authResult.user.userId);
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
