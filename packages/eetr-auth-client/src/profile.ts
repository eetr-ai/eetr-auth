import type { IDTokenClaims, UserInfoResponse, UserProfile } from "./types.js";

/**
 * Merge `/userinfo` claims (and optionally id_token claims) into a normalized,
 * camelCased {@link UserProfile}. UserInfo values take precedence over id_token
 * values — UserInfo is the authoritative, freshest source — and the id_token
 * fills any gap for claims `/userinfo` did not return.
 *
 * Fields stay optional because the server only returns claims the access token's
 * scopes allow (`profile` → name/preferredUsername/picture, `email` →
 * email/emailVerified), so a profile built from an `openid`-only token carries
 * just `sub`.
 */
export function toUserProfile(
  userInfo: UserInfoResponse,
  idTokenClaims?: IDTokenClaims
): UserProfile {
  const prefer = <T>(primary: T | undefined, fallback: T | undefined): T | undefined =>
    primary !== undefined ? primary : fallback;
  return {
    sub: userInfo.sub ?? idTokenClaims?.sub ?? "",
    name: prefer(userInfo.name, idTokenClaims?.name),
    preferredUsername: prefer(
      userInfo.preferred_username,
      idTokenClaims?.preferred_username
    ),
    picture: prefer(userInfo.picture, idTokenClaims?.picture),
    email: prefer(userInfo.email, idTokenClaims?.email),
    emailVerified: prefer(userInfo.email_verified, idTokenClaims?.email_verified),
  };
}
