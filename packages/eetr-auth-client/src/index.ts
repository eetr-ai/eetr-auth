export type {
  TokenResponse,
  UserInfoResponse,
  UserProfile,
  OIDCDiscovery,
  OAuthServerMetadata,
  AuthClientConfig,
  JWTPayload,
  IDTokenClaims,
  TokenValidationResponse,
} from "./types.js";

export {
  OIDCScope,
  STANDARD_OIDC_SCOPES,
  resolveScopeParam,
} from "./scopes.js";
export type { OIDCScopeValue } from "./scopes.js";

export { toUserProfile } from "./profile.js";

export { fetchOIDCDiscovery, fetchOAuthMetadata } from "./discovery.js";

export {
  OAuthError,
  exchangeToken,
  introspectToken,
  getUserInfo,
  buildAuthorizationUrl,
  registerClient,
} from "./api.js";
export type {
  GrantType,
  ExchangeTokenParams,
  ExchangeTokenConfig,
  IntrospectTokenParams,
  IntrospectTokenConfig,
  AuthorizationUrlParams,
  RegisterClientParams,
  RegisterClientConfig,
  RegisterClientResponse,
} from "./api.js";

export { TokenManager } from "./tokens.js";

export { validateJwt, validateIdToken, decodeJwtPayload } from "./jwt.js";
export type { ValidateJwtOptions, ValidateIdTokenOptions } from "./jwt.js";

export {
  getAdminUser,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
  listUserConsents,
  revokeUserConsent,
} from "./admin.js";
export type {
  AdminUserRecord,
  AdminClientConfig,
  AdminConsentRecord,
  RevokeConsentResult,
  CreateUserParams,
  UpdateUserParams,
} from "./admin.js";

export { listPasskeys, renamePasskey, removePasskey } from "./passkeys.js";
export type { PasskeySummary, UserClientConfig } from "./passkeys.js";
