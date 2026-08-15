import { NextResponse } from "next/server";
import { withApiContext } from "@/lib/context/with-api-context";

/**
 * Reads an object out of the assets bucket, for the local dev CDN only.
 *
 * In production the bucket is fronted by a real CDN on its own domain. There is
 * no such origin locally, so `scripts/dev-cdn.mjs` stands one up on another
 * port and proxies here. Keeping the R2 read in the app means the dev server
 * needs no knowledge of Miniflare's on-disk layout.
 *
 * Disabled outside development: this would otherwise be an unauthenticated read
 * of the whole bucket.
 */
export const GET = withApiContext(async (req, ctx) => {
	// Explicitly development-only: "not production" would also enable this under
	// test, unset, or any custom deployment environment.
	if (process.env.NODE_ENV !== "development") {
		return NextResponse.json({ error: "not_found" }, { status: 404 });
	}

	const url = new URL(req.url);
	const key = decodeURIComponent(url.pathname.replace(/^\/api\/dev\/assets\//, ""));
	if (!key || key.includes("..")) {
		return NextResponse.json({ error: "invalid_request" }, { status: 400 });
	}

	const env = ctx.env as unknown as { AUTH_ASSETS?: R2Bucket };
	const bucket = env.AUTH_ASSETS;
	if (!bucket) {
		return NextResponse.json({ error: "server_error" }, { status: 500 });
	}

	const object = await bucket.get(key);
	if (!object) {
		return NextResponse.json({ error: "not_found" }, { status: 404 });
	}

	return new NextResponse(object.body as unknown as BodyInit, {
		status: 200,
		headers: {
			"content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
			"cache-control": "no-store",
		},
	});
});
