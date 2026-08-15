export interface UserInfoClaimsUser {
	id: string;
	username: string;
	name: string | null;
	email: string | null;
	emailVerifiedAt: string | null;
	/**
	 * Already resolved against the CDN base by UserService, so this honours the
	 * site's CDN URL setting rather than rebuilding the URL from the environment.
	 */
	avatarUrl?: string | null;
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
	grantedScopes: Iterable<string>
): Record<string, unknown> {
	const scopes = new Set(grantedScopes);
	const claims: Record<string, unknown> = { sub: user.id };
	if (scopes.has("profile")) {
		claims.name = user.name ?? user.username;
		claims.preferred_username = user.username;
		claims.picture = user.avatarUrl ?? null;
	}
	if (scopes.has("email")) {
		claims.email = user.email;
		claims.email_verified = Boolean(user.emailVerifiedAt);
	}
	return claims;
}
