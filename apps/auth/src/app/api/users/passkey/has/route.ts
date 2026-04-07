import { NextResponse } from "next/server";
import { withApiContext } from "@/lib/context/with-api-context";
import { authenticateSessionOrBearerUser } from "@/lib/auth/authenticate-session-or-bearer-user";

export const GET = withApiContext(async (req, _ctx, getServices) => {
	const authResult = await authenticateSessionOrBearerUser(req, getServices);
	if ("response" in authResult) {
		return authResult.response;
	}

	const { passkeyService } = getServices();
	const hasPasskey = await passkeyService.hasPasskey(authResult.user.userId);
	return NextResponse.json(
		{ hasPasskey },
		{ status: 200, headers: { "Cache-Control": "no-store", Pragma: "no-cache" } }
	);
});
