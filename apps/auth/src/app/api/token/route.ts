import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withApiContext } from "@/lib/context/with-api-context";
import { isOAuthServiceError } from "@/lib/services/oauth.types";

function asString(value: FormDataEntryValue | string | null): string | null {
	return typeof value === "string" ? value : null;
}

function parseBasicClientAuth(req: NextRequest): { clientId: string | null; clientSecret: string | null } {
	const authorization = req.headers.get("authorization");
	if (!authorization?.startsWith("Basic ")) {
		return { clientId: null, clientSecret: null };
	}
	try {
		const encoded = authorization.slice("Basic ".length).trim();
		const decoded = atob(encoded);
		const separator = decoded.indexOf(":");
		if (separator < 0) {
			return { clientId: null, clientSecret: null };
		}
		return {
			clientId: decoded.slice(0, separator),
			clientSecret: decoded.slice(separator + 1),
		};
	} catch {
		return { clientId: null, clientSecret: null };
	}
}

function scheduleActivityLog(
	ctx: { waitUntil?: (p: Promise<unknown>) => void } | undefined,
	logPromise: Promise<void>
) {
	ctx?.waitUntil?.(logPromise.catch((err) => console.error("[token_activity_log]", err)));
}

function logStep(step: string, startMs: number, extra?: Record<string, string | number | null>) {
	const durationMs = Date.now() - startMs;
	const extraStr = extra ? ` ${Object.entries(extra).map(([k, v]) => `${k}=${v}`).join(" ")}` : "";
	console.log(`[token_endpoint] step=${step} duration_ms=${durationMs}${extraStr}`);
}

export const POST = withApiContext(async (req, ctx, getServices) => {
	const routeStartMs = Date.now();
	const ip = req.headers.get("CF-Connecting-IP") ?? null;

	let stepStart = Date.now();
	const body = await req.formData();
	logStep("parse_body", stepStart);

	stepStart = Date.now();
	const basic = parseBasicClientAuth(req);
	const bodyClientId = asString(body.get("client_id"));
	const bodyClientSecret = asString(body.get("client_secret"));
	const clientId = basic.clientId ?? bodyClientId;
	logStep("parse_params", stepStart);

	try {
		stepStart = Date.now();
		const { oauthTokenService, tokenActivityLogService } = getServices();
		logStep("get_services", stepStart);

		stepStart = Date.now();
		const token = await oauthTokenService.exchange({
			grantType: asString(body.get("grant_type")),
			clientId: basic.clientId ?? bodyClientId,
			clientSecret: basic.clientSecret ?? bodyClientSecret,
			scope: asString(body.get("scope")),
			code: asString(body.get("code")),
			redirectUri: asString(body.get("redirect_uri")),
			codeVerifier: asString(body.get("code_verifier")),
			refreshToken: asString(body.get("refresh_token")),
		});
		logStep("exchange", stepStart, { grant_type: asString(body.get("grant_type")) ?? null });
		const durationMs = Date.now() - routeStartMs;
		logStep("route_total", routeStartMs);
		scheduleActivityLog(ctx.ctx, tokenActivityLogService.logActivity({
			ip,
			requestType: "token",
			succeeded: true,
			clientId,
			durationMs,
		}));
		return NextResponse.json(token, {
			status: 200,
			headers: {
				"Cache-Control": "no-store",
				Pragma: "no-cache",
			},
		});
	} catch (error) {
		logStep("exchange_error", stepStart, { grant_type: asString(body.get("grant_type")) ?? null });
		const durationMs = Date.now() - routeStartMs;
		const { tokenActivityLogService } = getServices();
		scheduleActivityLog(ctx.ctx, tokenActivityLogService.logActivity({
			ip,
			requestType: "token",
			succeeded: false,
			clientId,
			durationMs,
		}));
		if (isOAuthServiceError(error)) {
			return NextResponse.json(
				{
					error: error.code,
					error_description: error.message,
				},
				{
					status: error.status,
					headers: {
						"Cache-Control": "no-store",
						Pragma: "no-cache",
						...(error.code === "invalid_client"
							? { "WWW-Authenticate": 'Basic realm="oauth_token"' }
							: {}),
					},
				}
			);
		}
		return NextResponse.json(
			{
				error: "server_error",
				error_description: "Unexpected token endpoint error.",
			},
			{
				status: 500,
				headers: {
					"Cache-Control": "no-store",
					Pragma: "no-cache",
				},
			}
		);
	}
});
