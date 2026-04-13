import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import {
	collectPendingAuthorizationParams,
	encodePendingAuthorizationCookie,
	getPendingCookieName,
	getPendingCookieTtlSeconds,
} from "@/lib/auth/oauth-pending-cookie";
import { withApiContext } from "@/lib/context/with-api-context";
import type { Services } from "@/lib/services/registry";
import { isOAuthServiceError } from "@/lib/services/oauth.types";

function asString(value: FormDataEntryValue | string | null): string | null {
	return typeof value === "string" ? value : null;
}

function scheduleActivityLog(
	ctx: { waitUntil?: (p: Promise<unknown>) => void } | undefined,
	logPromise: Promise<void>
) {
	ctx?.waitUntil?.(logPromise.catch((err) => console.error("[token_activity_log]", err)));
}

function withOAuthRedirectError(
	redirectUri: string,
	error: string,
	errorDescription: string,
	state?: string
) {
	const url = new URL(redirectUri);
	url.searchParams.set("error", error);
	url.searchParams.set("error_description", errorDescription);
	if (state) {
		url.searchParams.set("state", state);
	}
	return NextResponse.redirect(url, 303);
}

interface AuthorizeLogContext {
	ctx: { waitUntil?: (p: Promise<unknown>) => void } | undefined;
	env: Record<string, unknown>;
	startMs: number;
	ip: string | null;
}

function applyPendingCookie(response: NextResponse, req: NextRequest, value: string) {
	response.cookies.set(getPendingCookieName(), value, {
		httpOnly: true,
		sameSite: "lax",
		secure: req.nextUrl.protocol === "https:",
		path: "/",
		maxAge: getPendingCookieTtlSeconds(),
	});
}

function clearPendingCookie(response: NextResponse, req: NextRequest) {
	response.cookies.set(getPendingCookieName(), "", {
		httpOnly: true,
		sameSite: "lax",
		secure: req.nextUrl.protocol === "https:",
		path: "/",
		maxAge: 0,
	});
}

async function handleAuthorize(
	req: NextRequest,
	services: Services,
	logContext: AuthorizeLogContext
) {
	const session = await auth();

	if (req.method === "GET") {
		const pendingParams = collectPendingAuthorizationParams(req.nextUrl.searchParams);
		let response: NextResponse;
		if (!session?.user?.id) {
			const loginUrl = new URL("/", req.url);
			loginUrl.searchParams.set("callbackUrl", "/oauth/confirm");
			response = NextResponse.redirect(loginUrl);
		} else {
			const confirmUrl = new URL("/oauth/confirm", req.url);
			response = NextResponse.redirect(confirmUrl);
		}
		try {
			const cookieValue = await encodePendingAuthorizationCookie(pendingParams, logContext.env);
			applyPendingCookie(response, req, cookieValue);
		} catch (error) {
			console.error("[oauth_authorize] failed to encode pending cookie", {
				name: error instanceof Error ? error.name : typeof error,
				message: error instanceof Error ? error.message : String(error),
			});
			return NextResponse.json(
				{
					error: "server_error",
					error_description: "Unable to preserve authorization request.",
				},
				{ status: 500 }
			);
		}
		return response;
	}

	if (!session?.user?.id) {
		const loginUrl = new URL("/", req.url);
		loginUrl.searchParams.set("callbackUrl", "/oauth/confirm");
		return NextResponse.redirect(loginUrl);
	}

	const source = await req.formData();
	const clientId = asString(source.get("client_id"));

	try {
		const result = await services.oauthAuthorizationService.authorize({
			responseType: asString(source.get("response_type")),
			clientId,
			redirectUri: asString(source.get("redirect_uri")),
			scope: asString(source.get("scope")),
			state: asString(source.get("state")),
			codeChallenge: asString(source.get("code_challenge")),
			codeChallengeMethod: asString(source.get("code_challenge_method")),
			subject: session.user.username,
		});

		const durationMs = Date.now() - logContext.startMs;
		scheduleActivityLog(logContext.ctx, services.tokenActivityLogService.logActivity({
			ip: logContext.ip,
			requestType: "authorize",
			succeeded: true,
			clientId,
			durationMs,
		}));
		const redirectResponse = NextResponse.redirect(result.redirectTo, 303);
		clearPendingCookie(redirectResponse, req);
		return redirectResponse;
	} catch (error) {
		const durationMs = Date.now() - logContext.startMs;
		scheduleActivityLog(logContext.ctx, services.tokenActivityLogService.logActivity({
			ip: logContext.ip,
			requestType: "authorize",
			succeeded: false,
			clientId,
			durationMs,
		}));
		if (isOAuthServiceError(error)) {
			if (error.redirectUri) {
				return withOAuthRedirectError(
					error.redirectUri,
					error.code,
					error.message,
					error.state
				);
			}
			return NextResponse.json(
				{
					error: error.code,
					error_description: error.message,
				},
				{ status: error.status }
			);
		}
		return NextResponse.json(
			{
				error: "server_error",
				error_description: "Unexpected authorization server error.",
			},
			{ status: 500 }
		);
	}
}

export const GET = withApiContext(async (req, ctx, getServices) => {
	const startMs = Date.now();
	const ip = req.headers.get("CF-Connecting-IP") ?? null;
	return handleAuthorize(req, getServices(), { ctx: ctx.ctx, env: ctx.env as unknown as Record<string, unknown>, startMs, ip });
});

export const POST = withApiContext(async (req, ctx, getServices) => {
	const startMs = Date.now();
	const ip = req.headers.get("CF-Connecting-IP") ?? null;
	return handleAuthorize(req, getServices(), { ctx: ctx.ctx, env: ctx.env as unknown as Record<string, unknown>, startMs, ip });
});
