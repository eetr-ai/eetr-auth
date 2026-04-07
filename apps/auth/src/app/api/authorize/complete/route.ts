import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { cookies } from "next/headers";
import {
	decodePendingAuthorizationCookie,
	getPendingCookieName,
} from "@/lib/auth/oauth-pending-cookie";
import { withApiContext } from "@/lib/context/with-api-context";
import { isOAuthServiceError } from "@/lib/services/oauth.types";

function clearPendingCookie(response: NextResponse, req: NextRequest) {
	response.cookies.set(getPendingCookieName(), "", {
		httpOnly: true,
		sameSite: "lax",
		secure: req.nextUrl.protocol === "https:",
		path: "/",
		maxAge: 0,
	});
}

function redirectToClientError(
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

export const GET = withApiContext(async (req, ctx, getServices) => {
	const session = await auth();
	if (!session?.user?.id) {
		const loginUrl = new URL("/", req.url);
		loginUrl.searchParams.set("callbackUrl", "/oauth/confirm");
		return NextResponse.redirect(loginUrl);
	}

	const cookieStore = await cookies();
	const pendingParams = await decodePendingAuthorizationCookie(
		cookieStore.get(getPendingCookieName())?.value
	);

	const hasPkce =
		typeof pendingParams?.code_challenge === "string" &&
		pendingParams.code_challenge.length > 0 &&
		typeof pendingParams?.code_challenge_method === "string" &&
		pendingParams.code_challenge_method.length > 0;

	if (!pendingParams || !hasPkce || !pendingParams.redirect_uri) {
		return NextResponse.redirect(new URL("/?error=oauth_confirm_missing_pkce", req.url));
	}

	const services = getServices();

	try {
		const result = await services.oauthAuthorizationService.authorize({
			responseType: pendingParams.response_type ?? null,
			clientId: pendingParams.client_id ?? null,
			redirectUri: pendingParams.redirect_uri,
			scope: pendingParams.scope ?? null,
			state: pendingParams.state ?? null,
			codeChallenge: pendingParams.code_challenge ?? null,
			codeChallengeMethod: pendingParams.code_challenge_method ?? null,
			subject: session.user.id,
		});

		const redirectResponse = NextResponse.redirect(result.redirectTo, 303);
		clearPendingCookie(redirectResponse, req);
		return redirectResponse;
	} catch (error) {
		if (isOAuthServiceError(error) && error.redirectUri) {
			return redirectToClientError(
				error.redirectUri,
				error.code,
				error.message,
				error.state
			);
		}
		return NextResponse.redirect(new URL("/?error=oauth_confirm_failed", req.url));
	}
});
