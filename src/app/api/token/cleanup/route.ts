import { NextResponse } from "next/server";
import { withApiContext } from "@/lib/context/with-api-context";

export const POST = withApiContext(async (req, _ctx, getServices) => {
	let dryRun = false;
	const contentType = req.headers.get("content-type") ?? "";
	if (contentType.includes("application/json")) {
		const body = (await req.json()) as { dry_run?: unknown; dryRun?: unknown };
		dryRun =
			typeof body.dry_run === "boolean"
				? body.dry_run
				: typeof body.dryRun === "boolean"
					? body.dryRun
					: false;
	}

	const { oauthTokenService } = getServices();
	const result = await oauthTokenService.cleanupTokenArtifacts(dryRun);

	return NextResponse.json(
		{
			dry_run: dryRun,
			access_tokens_deleted: result.accessTokensDeleted,
			refresh_tokens_expired_deleted: result.refreshTokensExpiredDeleted,
			refresh_tokens_revoked_deleted: result.refreshTokensRevokedDeleted,
			authorization_codes_deleted: result.authorizationCodesDeleted,
			total_deleted: result.totalDeleted,
		},
		{
			status: 200,
			headers: {
				"Cache-Control": "no-store",
				Pragma: "no-cache",
			},
		}
	);
});
