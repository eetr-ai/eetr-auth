import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withApiContext } from "@/lib/context/with-api-context";
import type { RequestContext } from "@/lib/context/types";
import type { Services } from "@/lib/services/registry";

const NO_STORE_HEADERS = {
	"Cache-Control": "no-store",
	Pragma: "no-cache",
};

function parseBearerToken(authorizationHeader: string | null): string | null {
	if (!authorizationHeader) {
		return null;
	}
	const [scheme, value] = authorizationHeader.split(" ");
	if (!scheme || !value) {
		return null;
	}
	if (scheme.toLowerCase() !== "bearer") {
		return null;
	}
	const token = value.trim();
	return token.length > 0 ? token : null;
}

function scheduleActivityLog(
	ctx: { waitUntil?: (p: Promise<unknown>) => void } | undefined,
	logPromise: Promise<void>
) {
	ctx?.waitUntil?.(logPromise.catch((err) => console.error("[token_activity_log]", err)));
}

export interface AdminApiClientAuthContext {
	adminClientRowId: string;
	subjectUserId: string | null;
}

export type AdminApiClientContextHandler = (
	req: NextRequest,
	ctx: RequestContext,
	getServices: () => Services,
	auth: AdminApiClientAuthContext
) => Promise<Response>;

export function withAdminApiClientContext(handler: AdminApiClientContextHandler) {
	return withApiContext(async (req, ctx, getServices) => {
		const startMs = Date.now();
		const ip = req.headers.get("CF-Connecting-IP") ?? null;
		const { oauthTokenService, siteSettingsService, tokenActivityLogService } = getServices();

		const token = parseBearerToken(req.headers.get("authorization"));
		if (!token) {
			scheduleActivityLog(ctx.ctx, tokenActivityLogService.logActivity({
				ip,
				requestType: "admin_api",
				succeeded: false,
				durationMs: Date.now() - startMs,
			}));
			return NextResponse.json(
				{
					error: "invalid_token",
					error_description: "Bearer access token is required.",
				},
				{ status: 401, headers: NO_STORE_HEADERS }
			);
		}

		const validation = await oauthTokenService.validateAccessToken(token, [], null);
		if (!validation.valid || !validation.clientId) {
			scheduleActivityLog(ctx.ctx, tokenActivityLogService.logActivity({
				ip,
				requestType: "admin_api",
				succeeded: false,
				durationMs: Date.now() - startMs,
			}));
			return NextResponse.json(
				{
					error: "invalid_token",
					error_description: "Invalid or expired bearer access token.",
				},
				{ status: 401, headers: NO_STORE_HEADERS }
			);
		}

		const tokenClient = await getServices().clientService.getByClientIdentifier(validation.clientId);
		const tokenClientRowId = tokenClient?.id ?? validation.clientId;
		const adminClientRowIds = await siteSettingsService.getAdminApiClientRowIds();
		if (!adminClientRowIds.includes(tokenClientRowId)) {
			scheduleActivityLog(ctx.ctx, tokenActivityLogService.logActivity({
				ip,
				requestType: "admin_api",
				succeeded: false,
				clientId: validation.clientId,
				durationMs: Date.now() - startMs,
			}));
			return NextResponse.json(
				{
					error: "forbidden",
					error_description: "Token client is not configured as an admin API client.",
				},
				{ status: 403, headers: NO_STORE_HEADERS }
			);
		}

		const authContext = {
			adminClientRowId: tokenClientRowId,
			subjectUserId: validation.subject,
		};

		try {
			const response = await handler(req, ctx, getServices, authContext);
			scheduleActivityLog(ctx.ctx, tokenActivityLogService.logActivity({
				ip,
				requestType: "admin_api",
				succeeded: response.status < 400,
				clientId: validation.clientId,
				durationMs: Date.now() - startMs,
			}));
			return response;
		} catch (error) {
			scheduleActivityLog(ctx.ctx, tokenActivityLogService.logActivity({
				ip,
				requestType: "admin_api",
				succeeded: false,
				clientId: validation.clientId,
				durationMs: Date.now() - startMs,
			}));
			throw error;
		}

	});
}