import type { TokenResponse, UserInfoResponse, TokenValidationResponse } from "./types.js";

export class OAuthError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "OAuthError";
  }
}

export type GrantType = "authorization_code" | "client_credentials" | "refresh_token";

export interface AuthorizationUrlParams {
  clientId: string;
  redirectUri: string;
  /** PKCE S256 challenge (required by this server). */
  codeChallenge: string;
  scope?: string;
  state?: string;
  /** OIDC nonce, bound into the issued id_token for replay protection. */
  nonce?: string;
}

/**
 * Build an authorization-request URL for the authorization_code + PKCE flow.
 * Includes the OIDC `nonce` when provided so it is bound into the id_token.
 */
export function buildAuthorizationUrl(
  authorizationEndpoint: string,
  params: AuthorizationUrlParams
): string {
  const url = new URL(authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (params.scope) url.searchParams.set("scope", params.scope);
  if (params.state) url.searchParams.set("state", params.state);
  if (params.nonce) url.searchParams.set("nonce", params.nonce);
  return url.toString();
}

export interface ExchangeTokenParams {
  grantType: GrantType;
  clientId: string;
  clientSecret?: string;
  scope?: string;
  code?: string;
  redirectUri?: string;
  codeVerifier?: string;
  refreshToken?: string;
}

export interface ExchangeTokenConfig {
  tokenEndpoint: string;
}

export async function exchangeToken(
  params: ExchangeTokenParams,
  config: ExchangeTokenConfig
): Promise<TokenResponse> {
  const body = new URLSearchParams();
  body.set("grant_type", params.grantType);
  body.set("client_id", params.clientId);
  if (params.clientSecret) body.set("client_secret", params.clientSecret);
  if (params.scope) body.set("scope", params.scope);
  if (params.code) body.set("code", params.code);
  if (params.redirectUri) body.set("redirect_uri", params.redirectUri);
  if (params.codeVerifier) body.set("code_verifier", params.codeVerifier);
  if (params.refreshToken) body.set("refresh_token", params.refreshToken);

  const res = await fetch(config.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json()) as TokenResponse & {
    error?: string;
    error_description?: string;
  };
  if (!res.ok) {
    throw new OAuthError(
      data.error ?? "server_error",
      data.error_description ?? `Token exchange failed: ${res.status}`
    );
  }
  return data;
}

export interface IntrospectTokenParams {
  token: string;
  scopes?: string[];
  environmentName: string;
}

export interface IntrospectTokenConfig {
  introspectionEndpoint: string;
}

export async function introspectToken(
  params: IntrospectTokenParams,
  config: IntrospectTokenConfig
): Promise<TokenValidationResponse> {
  const res = await fetch(config.introspectionEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: params.token,
      scopes: params.scopes ?? [],
      environmentName: params.environmentName,
    }),
  });
  return res.json() as Promise<TokenValidationResponse>;
}

export async function getUserInfo(
  accessToken: string,
  userInfoEndpoint: string
): Promise<UserInfoResponse> {
  const res = await fetch(userInfoEndpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new OAuthError(
      data.error ?? "invalid_token",
      `UserInfo request failed: ${res.status}`
    );
  }
  return res.json() as Promise<UserInfoResponse>;
}
