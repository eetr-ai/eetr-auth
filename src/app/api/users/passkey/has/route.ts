import { NextResponse } from "next/server";
import { withApiContext } from "@/lib/context/with-api-context";
import { auth } from "@/auth";

export const GET = withApiContext(async (_req, _ctx, getServices) => {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "unauthorized" }, { status: 401 });
	}

	const { passkeyService } = getServices();
	const hasPasskey = await passkeyService.hasPasskey(session.user.id);
	return NextResponse.json({ hasPasskey }, { status: 200 });
});
