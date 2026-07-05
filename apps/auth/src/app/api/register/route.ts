import { NextResponse } from "next/server";
import { withApiContext } from "@/lib/context/with-api-context";
import { corsPreflight, noStoreCorsHeaders } from "@/lib/http/cors";
import { isDcrServiceError } from "@/lib/services/dcr.service";
import { parseDcrRegistrationRequest } from "./parse-request";

// Dynamic Client Registration is called by browser-based MCP clients, so allow CORS.
const JSON_HEADERS = noStoreCorsHeaders("POST, OPTIONS");

/** Respond to CORS preflight for /api/register. */
export const OPTIONS = corsPreflight("POST, OPTIONS");

/**
 * Dynamic Client Registration endpoint (RFC 7591). Public: no client authentication.
 * Registers a public (PKCE-only) or confidential OAuth client in the configured DCR
 * environment. Abuse is bounded by a per-IP daily rate limit in DcrService.
 */
export const POST = withApiContext(async (req, _ctx, getServices) => {
	const { dcrService, dcrRateLimitService } = getServices();
	const ip = req.headers.get("CF-Connecting-IP") ?? null;

	// Rate-limit at the edge, before touching the body, so malformed floods still count.
	const rate = await dcrRateLimitService.recordAttempt(ip);
	if (!rate.allowed) {
		return NextResponse.json(
			{
				error: "too_many_requests",
				error_description: `Registration rate limit exceeded (${rate.limit} per day).`,
			},
			{ status: 429, headers: JSON_HEADERS }
		);
	}

	// Decode the transport payload here; the service only ever sees a validated request.
	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json(
			{ error: "invalid_client_metadata", error_description: "Request body must be valid JSON." },
			{ status: 400, headers: JSON_HEADERS }
		);
	}

	try {
		const request = parseDcrRegistrationRequest(body);
		const registration = await dcrService.register(request);
		return NextResponse.json(registration, { status: 201, headers: JSON_HEADERS });
	} catch (error) {
		if (isDcrServiceError(error)) {
			return NextResponse.json(
				{ error: error.code, error_description: error.message },
				{ status: error.status, headers: JSON_HEADERS }
			);
		}
		console.error("[dcr_register] unexpected error", error);
		return NextResponse.json(
			{ error: "server_error", error_description: "Unexpected registration error." },
			{ status: 500, headers: JSON_HEADERS }
		);
	}
});
