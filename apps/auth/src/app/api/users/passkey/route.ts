import { NextResponse } from "next/server";
import { withApiContext } from "@/lib/context/with-api-context";
import { authenticateSessionOrBearerUser } from "@/lib/auth/authenticate-session-or-bearer-user";

// GET /api/users/passkey — list the authenticated user's passkeys (safe summaries).
export const GET = withApiContext(async (req, _ctx, getServices) => {
	const authResult = await authenticateSessionOrBearerUser(req, getServices);
	if ("response" in authResult) {
		return authResult.response;
	}

	try {
		const { passkeyService } = getServices();
		const passkeys = await passkeyService.listPasskeys(authResult.user.userId);
		return NextResponse.json(
			{ passkeys },
			{ status: 200, headers: { "Cache-Control": "no-store", Pragma: "no-cache" } }
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unexpected error.";
		return NextResponse.json(
			{ error: "server_error", error_description: message },
			{ status: 500 }
		);
	}
});
