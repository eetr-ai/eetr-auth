import { NextResponse } from "next/server";
import { withApiContext } from "@/lib/context/with-api-context";
import { getAvatarUrl } from "@/lib/users/profile";

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

export const GET = withApiContext(async (req, ctx, getServices) => {
	const token = parseBearerToken(req.headers.get("authorization"));
	if (!token || !isLikelyJwt(token)) {
		return NextResponse.json(
			{ error: "invalid_token", error_description: "A valid JWT access token is required." },
			{
				status: 401,
				headers: {
					"Cache-Control": "no-store",
					Pragma: "no-cache",
				},
			}
		);
	}
	const { oauthTokenService, userService } = getServices();
	const validation = await oauthTokenService.validateAccessToken(token, [], null);

	if (!validation.valid || !validation.subject) {
		return NextResponse.json(
			{ error: "invalid_token", error_description: "Invalid or missing access token." },
			{
				status: 401,
				headers: {
					"Cache-Control": "no-store",
					Pragma: "no-cache",
				},
			}
		);
	}

	const user = await userService.getById(validation.subject);
	if (!user) {
		return NextResponse.json(
			{ error: "invalid_token", error_description: "Token subject user not found." },
			{
				status: 401,
				headers: {
					"Cache-Control": "no-store",
					Pragma: "no-cache",
				},
			}
		);
	}

	const env = ctx.env as unknown as Record<string, unknown>;
	return NextResponse.json(
		{
			sub: user.id,
			name: user.name ?? user.username,
			email: user.email,
			email_verified: Boolean(user.emailVerifiedAt),
			picture: getAvatarUrl(user.avatarKey, env),
			preferred_username: user.username,
		},
		{
			status: 200,
			headers: {
				"Cache-Control": "no-store",
				Pragma: "no-cache",
			},
		}
	);
});
