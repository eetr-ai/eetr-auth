import { getAvatarUrl } from "@/lib/users/profile";

export interface UserInfoClaimsUser {
	id: string;
	username: string;
	name: string | null;
	email: string | null;
	emailVerifiedAt: string | null;
	avatarKey: string | null;
}

/**
 * Builds the OIDC UserInfo claim set, gating optional claims on the granted scopes:
 * `sub` is always present, the `profile` scope yields name/preferred_username/picture,
 * and the `email` scope yields email/email_verified. This mirrors the id_token claim
 * gating in {@link OauthTokenService.buildIdToken} so /userinfo and the id_token agree,
 * and enforces data minimization (a token never leaks claims it wasn't granted).
 */
export function buildUserInfoClaims(
	user: UserInfoClaimsUser,
	grantedScopes: Iterable<string>,
	env: Record<string, unknown>
): Record<string, unknown> {
	const scopes = new Set(grantedScopes);
	const claims: Record<string, unknown> = { sub: user.id };
	if (scopes.has("profile")) {
		claims.name = user.name ?? user.username;
		claims.preferred_username = user.username;
		claims.picture = getAvatarUrl(user.avatarKey, env);
	}
	if (scopes.has("email")) {
		claims.email = user.email;
		claims.email_verified = Boolean(user.emailVerifiedAt);
	}
	return claims;
}
