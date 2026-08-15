#!/usr/bin/env node
/**
 * Local stand-in for the asset CDN.
 *
 * In production, avatars and the site logo are served by a CDN on its own
 * domain, so every `<img>` that loads one is a cross-origin request. Serving
 * them from the Next origin in development would hide that: CORS problems, and
 * anything else that depends on the asset host being separate, would only show
 * up after deploying.
 *
 * So this listens on its own port and proxies to the app's dev-only asset
 * route, adding permissive CORS headers the way a CDN bucket would.
 *
 * Point the admin's CDN URL (Setup → Site identity) at http://localhost:8788
 * to use it.
 *
 * Plain node:http rather than express — it is a proxy with one route, and this
 * keeps the dev dependency list where it is.
 */
import { createServer } from "node:http";

const PORT = Number(process.env.DEV_CDN_PORT ?? 8788);
const ORIGIN = process.env.DEV_CDN_TARGET ?? "http://localhost:3000";

const CORS_HEADERS = {
	"access-control-allow-origin": "*",
	"access-control-allow-methods": "GET, HEAD, OPTIONS",
	"access-control-allow-headers": "*",
	"access-control-max-age": "86400",
};

const server = createServer(async (req, res) => {
	if (req.method === "OPTIONS") {
		res.writeHead(204, CORS_HEADERS);
		res.end();
		return;
	}
	if (req.method !== "GET" && req.method !== "HEAD") {
		res.writeHead(405, CORS_HEADERS);
		res.end();
		return;
	}

	let key;
	try {
		// Malformed percent-encoding throws; answer it like any other bad key
		// rather than letting it take down the request.
		key = decodeURIComponent((req.url ?? "/").replace(/^\/+/, "").split("?")[0]);
	} catch {
		key = null;
	}
	if (!key || key.includes("..")) {
		res.writeHead(400, { ...CORS_HEADERS, "content-type": "text/plain" });
		res.end("bad key");
		return;
	}

	try {
		const upstream = await fetch(
			`${ORIGIN}/api/dev/assets/${key.split("/").map(encodeURIComponent).join("/")}`,
		);
		const body = Buffer.from(await upstream.arrayBuffer());
		res.writeHead(upstream.status, {
			...CORS_HEADERS,
			"content-type": upstream.headers.get("content-type") ?? "application/octet-stream",
			"content-length": String(body.byteLength),
			"cache-control": "no-store",
		});
		res.end(req.method === "HEAD" ? undefined : body);
	} catch (error) {
		// Usually just the Next dev server still booting.
		res.writeHead(502, { ...CORS_HEADERS, "content-type": "text/plain" });
		res.end(`dev-cdn: cannot reach ${ORIGIN} (${error instanceof Error ? error.message : error})`);
	}
});

server.listen(PORT, () => {
	console.log(`▲ dev CDN  http://localhost:${PORT}  →  ${ORIGIN}/api/dev/assets/*`);
	console.log("  Set Setup → Site identity → CDN URL to that address to use it.");
});
