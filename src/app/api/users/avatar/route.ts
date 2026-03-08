import { NextResponse } from "next/server";
import { auth } from "@/auth";
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
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "unauthorized" }, { status: 401 });
	}

	const body = await req.formData();
	const userIdValue = body.get("userId");
	const fileValue = body.get("file");
	const userId = typeof userIdValue === "string" ? userIdValue.trim() : "";
	const file = fileValue instanceof File ? fileValue : null;

	if (!userId || !file) {
		return NextResponse.json(
			{
				error: "invalid_request",
				error_description: "Both userId and file are required.",
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
	const actorUserId = session.user.id;
	const isSelfUpdate = userId === actorUserId;
	if (!isSelfUpdate && !session.user.isAdmin) {
		return NextResponse.json({ error: "forbidden" }, { status: 403 });
	}

	const targetUser = await userService.getById(userId);
	if (!targetUser) {
		return NextResponse.json({ error: "not_found" }, { status: 404 });
	}

	const extension = extensionForMimeType(file.type);
	const avatarKey = `avatars/${userId}.${extension}`;
	const env = ctx.env as unknown as { BLOG_IMAGES?: R2Bucket };
	const bucket = env.BLOG_IMAGES;
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
		userId,
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
