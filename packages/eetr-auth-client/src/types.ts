export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
}

/**
 * UserInfo claims. Only `sub` is always present; the server gates the remaining
 * claims on the access token's granted scopes — `name`/`preferred_username`/`picture`
 * require the `profile` scope and `email`/`email_verified` require the `email` scope.
 * The endpoint itself requires the `openid` scope.
 */
export interface UserInfoResponse {
  sub: string;
  name?: string;
  email?: string;
  email_verified?: boolean;
  picture?: string;
  preferred_username?: string;
}

/**
 * Normalized user profile, merged from the `/userinfo` response and (optionally) the
 * id_token claims via {@link toUserProfile}. Claim names are camelCased. Every field
 * except `sub` is optional because the server only returns claims the access token's
 * scopes allow (`profile` → name/preferredUsername/picture, `email` →
 * email/emailVerified).
 */
export interface UserProfile {
  sub: string;
  name?: string;
  preferredUsername?: string;
  picture?: string;
  email?: string;
  emailVerified?: boolean;
}

export interface OIDCDiscovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  /** RFC 7591 Dynamic Client Registration endpoint, when the server supports it. */
  registration_endpoint?: string;
  jwks_uri: string;
  response_types_supported: string[];
  scopes_supported: string[];
  grant_types_supported: string[];
  subject_types_supported: string[];
  id_token_signing_alg_values_supported: string[];
  token_endpoint_auth_methods_supported?: string[];
  code_challenge_methods_supported: string[];
  /** RFC 8707: whether the `resource` parameter is honored. */
  resource_parameter_supported?: boolean;
}

export interface OAuthServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  /** RFC 7591 Dynamic Client Registration endpoint, when the server supports it. */
  registration_endpoint?: string;
  jwks_uri: string;
  token_introspection_endpoint?: string;
  response_types_supported: string[];
  scopes_supported: string[];
  grant_types_supported: string[];
  token_endpoint_auth_methods_supported?: string[];
  code_challenge_methods_supported: string[];
  /** RFC 8707: whether the `resource` parameter is honored. */
  resource_parameter_supported?: boolean;
}

export interface AuthClientConfig {
  issuerUrl: string;
  clientId: string;
  clientSecret?: string;
  tokenEndpoint: string;
}

export interface JWTPayload {
  sub?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  jti?: string;
  scope?: string;
  client_id?: string;
  [key: string]: unknown;
}

export interface TokenValidationResponse {
  valid: boolean;
  active: boolean;
  client_id: string | null;
  expires_at: string | null;
}

/** Claims an issued OIDC id_token may carry (OpenID Connect Core 1.0). */
export interface IDTokenClaims extends JWTPayload {
  sub?: string;
  auth_time?: number;
  nonce?: string;
  at_hash?: string;
  name?: string;
  preferred_username?: string;
  picture?: string;
  email?: string;
  email_verified?: boolean;
}
