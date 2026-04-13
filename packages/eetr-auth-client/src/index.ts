export type {
  TokenResponse,
  UserInfoResponse,
  OIDCDiscovery,
  OAuthServerMetadata,
  AuthClientConfig,
  JWTPayload,
  TokenValidationResponse,
} from "./types.js";

export { fetchOIDCDiscovery, fetchOAuthMetadata } from "./discovery.js";

export {
  OAuthError,
  exchangeToken,
  introspectToken,
  getUserInfo,
} from "./api.js";
export type {
  GrantType,
  ExchangeTokenParams,
  ExchangeTokenConfig,
  IntrospectTokenParams,
  IntrospectTokenConfig,
} from "./api.js";

export { TokenManager } from "./tokens.js";

export { validateJwt, decodeJwtPayload } from "./jwt.js";
export type { ValidateJwtOptions } from "./jwt.js";

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
