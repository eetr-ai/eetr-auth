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
		const token = parseBearerToken(req.headers.get("authorization"));
		if (!token) {
			return NextResponse.json(
				{
					error: "invalid_token",
					error_description: "Bearer access token is required.",
				},
				{ status: 401, headers: NO_STORE_HEADERS }
			);
		}

		const { oauthTokenService, siteSettingsService } = getServices();
		const validation = await oauthTokenService.validateAccessToken(token, [], null);
		if (!validation.valid || !validation.clientId) {
			return NextResponse.json(
				{
					error: "invalid_token",
					error_description: "Invalid or expired bearer access token.",
				},
				{ status: 401, headers: NO_STORE_HEADERS }
			);
		}

		const adminClientRowIds = await siteSettingsService.getAdminApiClientRowIds();
		if (!adminClientRowIds.includes(validation.clientId)) {
			return NextResponse.json(
				{
					error: "forbidden",
					error_description: "Token client is not configured as an admin API client.",
				},
				{ status: 403, headers: NO_STORE_HEADERS }
			);
		}

		return handler(req, ctx, getServices, {
			adminClientRowId: validation.clientId,
			subjectUserId: validation.subject,
		});
	});
}