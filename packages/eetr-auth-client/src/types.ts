export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
}

export interface UserInfoResponse {
  sub: string;
  name?: string;
  email?: string;
  email_verified?: boolean;
  picture?: string;
  preferred_username?: string;
}

export interface OIDCDiscovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  response_types_supported: string[];
  scopes_supported: string[];
  grant_types_supported: string[];
  subject_types_supported: string[];
  id_token_signing_alg_values_supported: string[];
  code_challenge_methods_supported: string[];
}

export interface OAuthServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  token_introspection_endpoint?: string;
  response_types_supported: string[];
  scopes_supported: string[];
  grant_types_supported: string[];
  code_challenge_methods_supported: string[];
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
