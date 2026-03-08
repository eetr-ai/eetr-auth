import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
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
	return NextResponse.redirect(url);
}

interface AuthorizeLogContext {
	ctx: { waitUntil?: (p: Promise<unknown>) => void } | undefined;
	startMs: number;
	ip: string | null;
}

async function handleAuthorize(
	req: NextRequest,
	services: Services,
	logContext: AuthorizeLogContext
) {
	const session = await auth();
	if (!session?.user?.id) {
		const loginUrl = new URL("/", req.url);
		loginUrl.searchParams.set("callbackUrl", req.url);
		return NextResponse.redirect(loginUrl);
	}
	if (req.method === "GET") {
		const confirmUrl = new URL("/oauth/confirm", req.url);
		confirmUrl.searchParams.set("callbackUrl", req.url);
		return NextResponse.redirect(confirmUrl);
	}

	const source: URLSearchParams | FormData =
		req.method === "GET" ? req.nextUrl.searchParams : await req.formData();
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
			subject: session.user.id,
		});

		const durationMs = Date.now() - logContext.startMs;
		scheduleActivityLog(logContext.ctx, services.tokenActivityLogService.logActivity({
			ip: logContext.ip,
			requestType: "authorize",
			succeeded: true,
			clientId,
			durationMs,
		}));
		return NextResponse.redirect(result.redirectTo);
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
	return handleAuthorize(req, getServices(), { ctx: ctx.ctx, startMs, ip });
});

export const POST = withApiContext(async (req, ctx, getServices) => {
	const startMs = Date.now();
	const ip = req.headers.get("CF-Connecting-IP") ?? null;
	return handleAuthorize(req, getServices(), { ctx: ctx.ctx, startMs, ip });
});
