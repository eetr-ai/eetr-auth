import { NextResponse } from "next/server";
import { withApiContext } from "@/lib/context/with-api-context";

export const GET = withApiContext(async (_req, _ctx, getServices) => {
	getServices(); // ensure services are available (e.g. DB connectivity implied)
	return NextResponse.json({ status: "ok", timestamp: new Date().toISOString() });
});
