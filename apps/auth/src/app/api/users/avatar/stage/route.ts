import { NextResponse } from "next/server";
import { authenticateSessionOrBearerUser } from "@/lib/auth/authenticate-session-or-bearer-user";
import { withApiContext } from "@/lib/context/with-api-context";
import { newStagedKey, validateImageUpload } from "@/lib/uploads/staged-upload";

/**
 * Stages a user avatar without applying it.
 *
 * The file is validated and written under `staging/`; the live avatar is
 * untouched until the returned key is passed to a save. That is what lets an
 * edit form preview a new picture and still be cancelled.
 *
 * Session-only, and deliberately not part of the public API: an API client has
 * no save step, so a staged key would simply be stranded. `POST
 * /api/users/avatar` applies an avatar in one call and is the contract for
 * those callers.
 */
export const POST = withApiContext(async (req, ctx, getServices) => {
	const authResult = await authenticateSessionOrBearerUser(req, getServices);
	if ("response" in authResult) {
		return authResult.response;
	}

	const {
		user: { userId: actorUserId, isAdmin, authMethod },
	} = authResult;

	if (authMethod !== "session") {
		return NextResponse.json(
			{
				error: "invalid_request",
				error_description: "Use POST /api/users/avatar to set an avatar with an access token.",
			},
			{ status: 400 }
		);
	}

	const body = await req.formData();
	const userIdValue = body.get("userId");
	const fileValue = body.get("file");
	const userId = typeof userIdValue === "string" ? userIdValue.trim() : "";
	const file = fileValue instanceof File ? fileValue : null;

	if (!file || !userId) {
		return NextResponse.json(
			{ error: "invalid_request", error_description: "Both userId and file are required." },
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

	if (userId !== actorUserId && !isAdmin) {
		return NextResponse.json(
			{
				error: "forbidden",
				error_description: "You may only update your own avatar unless you are an admin.",
			},
			{ status: 403 }
		);
	}

	// Resolved here so staging against a missing user fails now, rather than at
	// save time with an object already written.
	const { userService } = getServices();
	if (!(await userService.getById(userId))) {
		return NextResponse.json({ error: "not_found" }, { status: 404 });
	}

	const env = ctx.env as unknown as { AUTH_ASSETS?: R2Bucket };
	const bucket = env.AUTH_ASSETS;
	if (!bucket) {
		return NextResponse.json(
			{ error: "server_error", error_description: "Avatar storage is not configured." },
			{ status: 500 }
		);
	}

	const stagedKey = newStagedKey(file.type);
	await bucket.put(stagedKey, await file.arrayBuffer(), {
		httpMetadata: { contentType: file.type },
	});

	return NextResponse.json({ ok: true, stagedKey, contentType: file.type }, { status: 200 });
});
