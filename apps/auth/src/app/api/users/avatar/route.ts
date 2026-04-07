import { NextResponse } from "next/server";
import { authenticateSessionOrBearerUser } from "@/lib/auth/authenticate-session-or-bearer-user";
import { withApiContext } from "@/lib/context/with-api-context";
import { getAvatarUrl } from "@/lib/users/profile";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function extensionForMimeType(contentType: string): string {
	if (contentType === "image/jpeg") return "jpg";
	if (contentType === "image/png") return "png";
	if (contentType === "image/webp") return "webp";
	return "bin";
}

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
					authMethod === "bearer"
						? "file is required."
						: "Both userId and file are required.",
			},
			{ status: 400 }
		);
	}
	if (!ALLOWED_MIME_TYPES.has(file.type)) {
		return NextResponse.json(
			{
				error: "invalid_request",
				error_description: "Unsupported image type. Use JPEG, PNG, or WEBP.",
			},
			{ status: 400 }
		);
	}
	if (file.size > MAX_AVATAR_BYTES) {
		return NextResponse.json(
			{
				error: "invalid_request",
				error_description: "Image is too large. Maximum is 5MB.",
			},
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

	const targetUser = await userService.getById(targetUserId);
	if (!targetUser) {
		return NextResponse.json({ error: "not_found" }, { status: 404 });
	}

	const extension = extensionForMimeType(file.type);
	const avatarKey = `avatars/${targetUserId}.${extension}`;
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

	const bodyBuffer = await file.arrayBuffer();
	await bucket.put(avatarKey, bodyBuffer, {
		httpMetadata: { contentType: file.type },
	});

	const updated = await userService.updateUser(
		targetUserId,
		{ avatarKey },
		actorUserId
	);
	const envRecord = ctx.env as unknown as Record<string, unknown>;

	return NextResponse.json(
		{
			ok: true,
			avatarKey,
			picture: updated.avatarUrl ?? getAvatarUrl(avatarKey, envRecord),
		},
		{ status: 200 }
	);
});
