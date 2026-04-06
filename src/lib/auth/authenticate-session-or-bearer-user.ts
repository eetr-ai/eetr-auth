import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { Services } from "@/lib/services/registry";

export type AuthenticatedRequestUser = {
	userId: string;
	isAdmin: boolean;
	authMethod: "bearer" | "session";
};

function parseBearerToken(authorizationHeader: string | null): string | null {
	if (!authorizationHeader) return null;
	const [scheme, value] = authorizationHeader.split(" ");
	if (!scheme || !value) return null;
	if (scheme.toLowerCase() !== "bearer") return null;
	const token = value.trim();
	return token.length > 0 ? token : null;
}

function isLikelyJwt(token: string): boolean {
	const parts = token.split(".");
	return parts.length === 3 && parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part));
}

export function unauthorizedUserAuth(description: string) {
	return NextResponse.json(
		{ error: "invalid_token", error_description: description },
		{
			status: 401,
			headers: {
				"Cache-Control": "no-store",
				Pragma: "no-cache",
			},
		}
	);
}

export async function authenticateSessionOrBearerUser(
	req: Request,
	getServices: () => Services
): Promise<{ user: AuthenticatedRequestUser } | { response: NextResponse }> {
	const bearerToken = parseBearerToken(req.headers.get("authorization"));
	if (bearerToken) {
		if (!isLikelyJwt(bearerToken)) {
			return { response: unauthorizedUserAuth("A valid JWT access token is required.") };
		}

		const { oauthTokenService } = getServices();
		const validation = await oauthTokenService.validateAccessToken(bearerToken, [], null);
		if (!validation.valid || !validation.subject) {
			return { response: unauthorizedUserAuth("Invalid or expired access token.") };
		}

		return {
			user: {
				userId: validation.subject,
				isAdmin: false,
				authMethod: "bearer",
			},
		};
	}

	const session = await auth();
	if (!session?.user?.id) {
		return { response: unauthorizedUserAuth("A valid access token or session is required.") };
	}

	return {
		user: {
			userId: session.user.id,
			isAdmin: Boolean(session.user.isAdmin),
			authMethod: "session",
		},
	};
}