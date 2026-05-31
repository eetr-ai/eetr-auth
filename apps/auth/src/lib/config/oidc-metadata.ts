/**
 * Canonical OIDC/OAuth discovery metadata values that must stay in sync with the
 * server's actual behavior. Keep this list aligned with the claims emitted by
 * OauthTokenService.buildIdToken and the user claims returned by /api/userinfo.
 */

/** Claims that can appear in an issued id_token (and /userinfo for the user claims). */
export const OIDC_CLAIMS_SUPPORTED = [
	// Standard id_token claims, always present (auth_time/nonce when available).
	"sub",
	"iss",
	"aud",
	"exp",
	"iat",
	"auth_time",
	"nonce",
	"at_hash",
	// Gated on the `profile` scope.
	"name",
	"preferred_username",
	"picture",
	// Gated on the `email` scope.
	"email",
	"email_verified",
] as const;

/** Client authentication methods accepted at the token endpoint. */
export const TOKEN_ENDPOINT_AUTH_METHODS_SUPPORTED = [
	"client_secret_basic",
	"client_secret_post",
] as const;

/** Response modes the authorization endpoint supports (query params on redirect). */
export const RESPONSE_MODES_SUPPORTED = ["query"] as const;
