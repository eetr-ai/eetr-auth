import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { withApiContext } from "@/lib/context/with-api-context";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function extensionForMimeType(contentType: string): string {
	if (contentType === "image/jpeg") return "jpg";
	if (contentType === "image/png") return "png";
	if (contentType === "image/webp") return "webp";
	return "bin";
}

export const POST = withApiContext(async (req, ctx, getServices) => {
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
	if (!ALLOWED_MIME_TYPES.has(file.type)) {
		return NextResponse.json(
			{
				error: "invalid_request",
				error_description: "Unsupported image type. Use JPEG, PNG, or WEBP.",
			},
			{ status: 400 }
		);
	}
	if (file.size > MAX_BYTES) {
		return NextResponse.json(
			{
				error: "invalid_request",
				error_description: "Image is too large. Maximum is 5MB.",
			},
			{ status: 400 }
		);
	}

	const env = ctx.env as unknown as { BLOG_IMAGES?: R2Bucket };
	const bucket = env.BLOG_IMAGES;
	if (!bucket) {
		return NextResponse.json(
			{
				error: "server_error",
				error_description: "Logo storage is not configured.",
			},
			{ status: 500 }
		);
	}

	const extension = extensionForMimeType(file.type);
	const logoKey = `site/logo.${extension}`;
	const buffer = await file.arrayBuffer();
	await bucket.put(logoKey, buffer, {
		httpMetadata: { contentType: file.type },
	});

	const { siteSettingsService } = getServices();
	const dto = await siteSettingsService.setLogoKey(logoKey);

	return NextResponse.json(
		{
			ok: true,
			logoKey,
			logoUrl: dto.displayLogoUrl,
			settings: dto,
		},
		{ status: 200 }
	);
});
