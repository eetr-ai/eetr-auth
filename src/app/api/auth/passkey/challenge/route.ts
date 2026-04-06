import { NextResponse } from "next/server";
import { withApiContext } from "@/lib/context/with-api-context";

export const POST = withApiContext(async (_req, _ctx, getServices) => {
	try {
		const { passkeyService } = getServices();
		const result = await passkeyService.generateAuthenticationChallenge();
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
