import type { TokenResponse, UserInfoResponse, TokenValidationResponse } from "./types.js";
import { resolveScopeParam } from "./scopes.js";

export class OAuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    /** HTTP status of the failed response, when the error came from one. */
    public readonly status?: number,
    /** The server's `error_description`, when present. */
    public readonly description?: string
  ) {
    super(message);
    this.name = "OAuthError";
  }

  /**
   * True when the access token was valid but lacked a required scope (HTTP 403
   * `insufficient_scope`) — e.g. calling `/userinfo` with a token that was not
   * granted `openid`. Re-authorize requesting the missing scope rather than
   * treating the token as invalid.
   */
  get isInsufficientScope(): boolean {
    return this.code === "insufficient_scope";
  }
}

export type GrantType = "authorization_code" | "client_credentials" | "refresh_token";

export interface AuthorizationUrlParams {
  clientId: string;
  redirectUri: string;
  /** PKCE S256 challenge (required by this server). */
  codeChallenge: string;
  /** Space-delimited scope string. Merged with `scopes` if both are given. */
  scope?: string;
  /**
   * Scopes as an array (e.g. `[OIDCScope.OpenId, OIDCScope.Profile]`). Merged
   * with `scope`, de-duplicated. Prefer this with the `OIDCScope` constants so
   * `openid` can't be dropped by a typo.
   */
  scopes?: readonly string[];
  state?: string;
  /** OIDC nonce, bound into the issued id_token for replay protection. */
  nonce?: string;
  /**
   * RFC 8707 resource indicator: the protected-resource URL the token is for. The server
   * binds the access token's `aud` to this value (instead of the client_id). Pass the same
   * value to {@link exchangeToken}.
   */
  resource?: string;
}

/**
 * Build an authorization-request URL for the authorization_code + PKCE flow.
 * Includes the OIDC `nonce` and RFC 8707 `resource` when provided.
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
  const scope = resolveScopeParam(params.scope, params.scopes);
  if (scope) url.searchParams.set("scope", scope);
  if (params.state) url.searchParams.set("state", params.state);
  if (params.nonce) url.searchParams.set("nonce", params.nonce);
  if (params.resource) url.searchParams.set("resource", params.resource);
  return url.toString();
}

export interface ExchangeTokenParams {
  grantType: GrantType;
  clientId: string;
  clientSecret?: string;
  /** Space-delimited scope string. Merged with `scopes` if both are given. */
  scope?: string;
  /** Scopes as an array (e.g. with the `OIDCScope` constants). Merged with `scope`. */
  scopes?: readonly string[];
  code?: string;
  redirectUri?: string;
  codeVerifier?: string;
  refreshToken?: string;
  /**
   * RFC 8707 resource indicator. When provided it must match the value sent to
   * {@link buildAuthorizationUrl} (the server rejects a mismatch with `invalid_target`).
   */
  resource?: string;
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
  const scope = resolveScopeParam(params.scope, params.scopes);
  if (scope) body.set("scope", scope);
  if (params.code) body.set("code", params.code);
  if (params.redirectUri) body.set("redirect_uri", params.redirectUri);
  if (params.codeVerifier) body.set("code_verifier", params.codeVerifier);
  if (params.refreshToken) body.set("refresh_token", params.refreshToken);
  if (params.resource) body.set("resource", params.resource);

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
  /**
   * Optional audience binding. When set to the calling resource server's own
   * client_id, the token is only reported valid if it was issued to that client —
   * preventing a token minted for a sibling client in the same environment from
   * being accepted here. Omit to keep the previous (audience-agnostic) behavior.
   */
  clientId?: string;
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
      ...(params.clientId ? { clientId: params.clientId } : {}),
    }),
  });
  return res.json() as Promise<TokenValidationResponse>;
}

export interface RegisterClientParams {
  /** Human-readable name shown on the consent screen. */
  clientName?: string;
  /**
   * Required. Exact-match https URLs; http is allowed only on a loopback host
   * (`localhost`, any 127.0.0.0/8 address, or `[::1]`). At `/authorize` the loopback host is
   * matched interchangeably — scheme, port, path, and query still have to match exactly.
   */
  redirectUris: string[];
  /** Defaults server-side to `none` (public/PKCE). Use a confidential method for a secret. */
  tokenEndpointAuthMethod?: "none" | "client_secret_basic" | "client_secret_post";
  /** Defaults server-side to `["authorization_code", "refresh_token"]`. */
  grantTypes?: string[];
  /** Defaults server-side to `["code"]`. */
  responseTypes?: string[];
  /** Space-delimited scope string. Merged with `scopes` if both are given. */
  scope?: string;
  /** Scopes as an array (e.g. with the `OIDCScope` constants). Merged with `scope`. */
  scopes?: readonly string[];
}

export interface RegisterClientConfig {
  /** The `registration_endpoint` from discovery metadata. */
  registrationEndpoint: string;
}

/** RFC 7591 client registration response. `client_secret` is present only for confidential clients. */
export interface RegisterClientResponse {
  client_id: string;
  client_id_issued_at: number;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  scope?: string;
  client_secret?: string;
  client_secret_expires_at?: number;
}

/**
 * Dynamically register an OAuth client (RFC 7591) at the server's `registration_endpoint`.
 * Public clients (`tokenEndpointAuthMethod: "none"`, the default) get no secret and use PKCE.
 * Throws {@link OAuthError} on a non-2xx response (e.g. `invalid_redirect_uri`,
 * `invalid_client_metadata`, or `too_many_requests` when rate-limited).
 */
export async function registerClient(
  params: RegisterClientParams,
  config: RegisterClientConfig
): Promise<RegisterClientResponse> {
  const requestBody: Record<string, unknown> = { redirect_uris: params.redirectUris };
  if (params.clientName) requestBody.client_name = params.clientName;
  if (params.tokenEndpointAuthMethod) requestBody.token_endpoint_auth_method = params.tokenEndpointAuthMethod;
  if (params.grantTypes) requestBody.grant_types = params.grantTypes;
  if (params.responseTypes) requestBody.response_types = params.responseTypes;
  const scope = resolveScopeParam(params.scope, params.scopes);
  if (scope) requestBody.scope = scope;

  const res = await fetch(config.registrationEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  const data = (await res.json().catch(() => ({}))) as RegisterClientResponse & {
    error?: string;
    error_description?: string;
  };
  if (!res.ok) {
    throw new OAuthError(
      data.error ?? "server_error",
      data.error_description ?? `Client registration failed: ${res.status}`,
      res.status,
      data.error_description
    );
  }
  return data;
}

export async function getUserInfo(
  accessToken: string,
  userInfoEndpoint: string
): Promise<UserInfoResponse> {
  const res = await fetch(userInfoEndpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      error_description?: string;
    };
    // A 403 means the token is valid but missing a required scope (`openid`).
    // Surface it as `insufficient_scope` so callers can re-authorize with the
    // right scopes instead of discarding the token as invalid. A 401 (or a
    // non-JSON body) stays `invalid_token`.
    const code =
      data.error ?? (res.status === 403 ? "insufficient_scope" : "invalid_token");
    const message =
      data.error_description ??
      (code === "insufficient_scope"
        ? "UserInfo requires the openid scope on the access token."
        : `UserInfo request failed: ${res.status}`);
    throw new OAuthError(code, message, res.status, data.error_description);
  }
  return res.json() as Promise<UserInfoResponse>;
}
