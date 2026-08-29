import { NextResponse } from "next/server";
import { withApiContext } from "@/lib/context/with-api-context";
import { parseApiKeyRequest } from "./parse-request";
import { corsPreflight, noStoreCorsHeaders } from "@/lib/http/cors";
import { isOAuthServiceError } from "@/lib/services/oauth.types";

const NO_STORE_HEADERS = noStoreCorsHeaders("POST, OPTIONS");

export const OPTIONS = corsPreflight("POST, OPTIONS");

function scheduleActivityLog(
	ctx: { waitUntil?: (p: Promise<unknown>) => void } | undefined,
	promise: Promise<unknown>
) {
	ctx?.waitUntil?.(promise.catch((err) => console.error("[api_key_endpoint]", err)));
}

/**
 * POST /api/token/api-key -- exchange a long-lived API key for a short-lived access token.
 *
 * Deliberately separate from /api/token: it authenticates with one opaque credential rather
 * than client_id + client_secret, so it is not an OAuth grant and the token endpoint stays
 * spec-clean. The response carries no refresh_token; the API key is the durable credential.
 */
export const POST = withApiContext(async (req, ctx, getServices) => {
	const routeStartMs = Date.now();
	const ip = req.headers.get("CF-Connecting-IP") ?? null;
	const parsed = await parseApiKeyRequest(req);

	const { oauthTokenService, tokenActivityLogService, apiKeyService } = getServices();

	try {
		const { response, apiKeyRowId, clientId } = await oauthTokenService.exchangeApiKey({
			apiKey: parsed.apiKey,
			scope: parsed.scope,
			resource: parsed.resource,
		});

		scheduleActivityLog(
			ctx.ctx,
			Promise.all([
				tokenActivityLogService.logActivity({
					ip,
					requestType: "api_key",
					succeeded: true,
					clientId,
					durationMs: Date.now() - routeStartMs,
				}),
				// Usage stamping is best-effort and must never delay or fail the exchange.
				apiKeyService.touchLastUsed(apiKeyRowId),
			])
		);

		return NextResponse.json(response, { status: 200, headers: NO_STORE_HEADERS });
	} catch (error) {
		// clientId is unknown on failure by design -- the key never resolved to a client.
		scheduleActivityLog(
			ctx.ctx,
			tokenActivityLogService.logActivity({
				ip,
				requestType: "api_key",
				succeeded: false,
				clientId: null,
				durationMs: Date.now() - routeStartMs,
			})
		);

		if (isOAuthServiceError(error)) {
			return NextResponse.json(
				{ error: error.code, error_description: error.message },
				{
					status: error.status,
					headers: {
						...NO_STORE_HEADERS,
						...(error.code === "invalid_client"
							? { "WWW-Authenticate": 'Bearer realm="api_key"' }
							: {}),
					},
				}
			);
		}
		console.error("[api_key_endpoint] unexpected error", error);
		return NextResponse.json(
			{ error: "server_error", error_description: "Unexpected API key endpoint error." },
			{ status: 500, headers: NO_STORE_HEADERS }
		);
	}
});
