import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withApiContext } from "@/lib/context/with-api-context";
import type { RequestContext } from "@/lib/context/types";
import type { Services } from "@/lib/services/registry";
import { decideSelfServiceAccess } from "./self-service-access";

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
	/**
	 * The row id of the client whose token authenticated this request.
	 *
	 * Normally an admin API client (see site settings). When a route opts into
	 * {@link SelfServiceOptions} this may instead be an ordinary client acting on its own
	 * resources -- `selfServiceUserId` is what distinguishes the two.
	 */
	adminClientRowId: string;
	subjectUserId: string | null;
	/**
	 * Non-null when the caller is NOT an admin API client, but an ordinary client
	 * presenting a user-scoped token for itself. Every operation the route performs must be
	 * confined to this user. Null for a normal admin-API call, which is unconfined.
	 */
	selfServiceUserId: string | null;
}

export interface SelfServiceOptions {
	/**
	 * The client this request is *about*, taken from the path (e.g. the `{clientId}` in
	 * `/api/admin/clients/{clientId}/api-keys`). Returning null disables the self-service
	 * path for this request.
	 */
	resolveTargetClientId: (req: NextRequest) => string | null;
}

export type AdminApiClientContextHandler = (
	req: NextRequest,
	ctx: RequestContext,
	getServices: () => Services,
	auth: AdminApiClientAuthContext
) => Promise<Response>;

export interface WithAdminApiClientContextOptions {
	/**
	 * Opt in to accepting a non-admin caller that is managing its *own* resources.
	 *
	 * Omitted by default, so every existing admin route keeps requiring a configured admin
	 * API client. A route that passes this additionally accepts a token that:
	 *
	 *   1. was issued to the very client named in the path (not merely any client),
	 *   2. carries a subject -- i.e. it is user-scoped, not client_credentials, and
	 *   3. was not itself minted from an API key.
	 *
	 * (3) is what stops a credential from escalating itself: a key expiring next week and
	 * narrowed to `read` could otherwise exchange itself for a token and use it to issue a
	 * never-expiring key holding every scope the client has.
	 */
	selfService?: SelfServiceOptions;
}

export function withAdminApiClientContext(
	handler: AdminApiClientContextHandler,
	options: WithAdminApiClientContextOptions = {}
) {
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
		const isAdminClient = adminClientRowIds.includes(tokenClientRowId);

		// Resolved below only when the caller is not an admin client and the route opted in.
		let selfServiceUserId: string | null = null;

		if (!isAdminClient) {
			const denied = (description: string) => {
				scheduleActivityLog(ctx.ctx, tokenActivityLogService.logActivity({
					ip,
					requestType: "admin_api",
					succeeded: false,
					clientId: validation.clientId,
					durationMs: Date.now() - startMs,
				}));
				return NextResponse.json(
					{ error: "forbidden", error_description: description },
					{ status: 403, headers: NO_STORE_HEADERS }
				);
			};

			const targetClientId = options.selfService?.resolveTargetClientId(req) ?? null;
			const targetClient = targetClientId
				? await getServices().clientService.getByClientIdentifier(targetClientId)
				: null;

			const decision = decideSelfServiceAccess({
				enabled: Boolean(options.selfService),
				targetClientRowId: targetClient?.id ?? null,
				tokenClientRowId,
				subject: validation.subject,
				apiKeyId: validation.apiKeyId,
			});
			if (!decision.allowed) {
				return denied(decision.description);
			}
			selfServiceUserId = decision.userId;
		}

		const authContext = {
			adminClientRowId: tokenClientRowId,
			subjectUserId: validation.subject,
			selfServiceUserId,
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