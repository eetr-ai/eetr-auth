import { NextResponse } from "next/server";
import { authenticateSessionOrBearerUser } from "@/lib/auth/authenticate-session-or-bearer-user";
import { withApiContext } from "@/lib/context/with-api-context";
import { newStagedKey, validateImageUpload } from "@/lib/uploads/staged-upload";

/**
 * Stages a user avatar.
 *
 * This no longer replaces the live avatar. The file lands under `staging/` and
 * the returned key is held by the form until it is saved, so cancelling an edit
 * leaves the current picture untouched. Saving promotes it — see
 * `UserService.updateUser`.
 */
export const POST = withApiContext(async (req, ctx, getServices) => {
	const authResult = await authenticateSessionOrBearerUser(req, getServices);
	if ("response" in authResult) {
		return authResult.response;
	}

	const body = await req.formData();
	const userIdValue = body.get("userId");
	const fileValue = body.get("file");
	const userId = typeof userIdValue === "string" ? userIdValue.trim() : "";
	const file = fileValue instanceof File ? fileValue : null;
	const {
		user: { userId: actorUserId, isAdmin, authMethod },
	} = authResult;
	const targetUserId = authMethod === "bearer" ? actorUserId : userId;

	if (!file || (authMethod === "session" && !userId)) {
		return NextResponse.json(
			{
				error: "invalid_request",
				error_description:
					authMethod === "bearer" ? "file is required." : "Both userId and file are required.",
			},
			{ status: 400 }
		);
	}

	const invalid = validateImageUpload(file);
	if (invalid) {
		return NextResponse.json(
			{ error: "invalid_request", error_description: invalid },
			{ status: 400 }
		);
	}

	const { userService } = getServices();
	const isSelfUpdate = targetUserId === actorUserId;
	if (authMethod === "session" && !isSelfUpdate && !isAdmin) {
		return NextResponse.json(
			{
				error: "forbidden",
				error_description: "You may only update your own avatar unless you are an admin.",
			},
			{ status: 403 }
		);
	}

	// Still resolved here so an upload against a missing user fails now, rather
	// than at save time with a staged object already written.
	const targetUser = await userService.getById(targetUserId);
	if (!targetUser) {
		return NextResponse.json({ error: "not_found" }, { status: 404 });
	}

	const env = ctx.env as unknown as { AUTH_ASSETS?: R2Bucket };
	const bucket = env.AUTH_ASSETS;
	if (!bucket) {
		return NextResponse.json(
			{
				error: "server_error",
				error_description: "Avatar storage is not configured.",
			},
			{ status: 500 }
		);
	}

	const stagedKey = newStagedKey(file.type);
	await bucket.put(stagedKey, await file.arrayBuffer(), {
		httpMetadata: { contentType: file.type },
	});

	return NextResponse.json({ ok: true, stagedKey, contentType: file.type }, { status: 200 });
});
