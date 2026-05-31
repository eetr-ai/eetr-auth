export type {
  TokenResponse,
  UserInfoResponse,
  OIDCDiscovery,
  OAuthServerMetadata,
  AuthClientConfig,
  JWTPayload,
  IDTokenClaims,
  TokenValidationResponse,
} from "./types.js";

export { fetchOIDCDiscovery, fetchOAuthMetadata } from "./discovery.js";

export {
  OAuthError,
  exchangeToken,
  introspectToken,
  getUserInfo,
  buildAuthorizationUrl,
} from "./api.js";
export type {
  GrantType,
  ExchangeTokenParams,
  ExchangeTokenConfig,
  IntrospectTokenParams,
  IntrospectTokenConfig,
  AuthorizationUrlParams,
} from "./api.js";

export { TokenManager } from "./tokens.js";

export { validateJwt, validateIdToken, decodeJwtPayload } from "./jwt.js";
export type { ValidateJwtOptions, ValidateIdTokenOptions } from "./jwt.js";

export {
  getAdminUser,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
} from "./admin.js";
export type {
  AdminUserRecord,
  AdminClientConfig,
  CreateUserParams,
  UpdateUserParams,
} from "./admin.js";

export { listPasskeys, renamePasskey, removePasskey } from "./passkeys.js";
export type { PasskeySummary, UserClientConfig } from "./passkeys.js";
