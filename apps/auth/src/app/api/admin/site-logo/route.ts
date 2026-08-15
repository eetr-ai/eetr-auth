import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { withApiContext } from "@/lib/context/with-api-context";
import { newStagedKey, validateImageUpload } from "@/lib/uploads/staged-upload";

/**
 * Stages a site logo.
 *
 * This no longer replaces the live logo. The file lands under `staging/` and
 * the returned key is held by the Setup form until it is saved, so cancelling
 * leaves the current logo untouched.
 */
export const POST = withApiContext(async (req, ctx) => {
	const session = await auth();
	if (!session?.user?.id || !session.user.isAdmin) {
		return NextResponse.json({ error: "forbidden" }, { status: 403 });
	}

	const body = await req.formData();
	const fileValue = body.get("file");
	const file = fileValue instanceof File ? fileValue : null;

	if (!file) {
		return NextResponse.json(
			{ error: "invalid_request", error_description: "file is required." },
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

	const env = ctx.env as unknown as { AUTH_ASSETS?: R2Bucket };
	const bucket = env.AUTH_ASSETS;
	if (!bucket) {
		return NextResponse.json(
			{
				error: "server_error",
				error_description: "Logo storage is not configured.",
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
