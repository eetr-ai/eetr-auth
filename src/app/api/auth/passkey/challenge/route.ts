import { NextResponse } from "next/server";
import { withApiContext } from "@/lib/context/with-api-context";

export const POST = withApiContext(async (req, _ctx, getServices) => {
	try {
		const rpIdMode = new URL(req.url).searchParams.get("rpId");
		const { passkeyService } = getServices();
		const result = await passkeyService.generateAuthenticationChallenge(rpIdMode === "fallback");
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
