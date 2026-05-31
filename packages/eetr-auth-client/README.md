# @eetr/eetr-auth-client

TypeScript client library for the [eetr-auth](https://github.com/eetr-ai/eetr-auth) OAuth 2.1 / OIDC server.

It wraps the server's token, introspection, UserInfo, admin, and passkey-management
endpoints, plus helpers for OIDC discovery and JWT verification. Everything is
`fetch`-based and ships with full type definitions.

## Installation

```bash
npm install @eetr/eetr-auth-client
```

```bash
pnpm add @eetr/eetr-auth-client
# or
yarn add @eetr/eetr-auth-client
```

**Requirements:** Node.js 18+ (the library relies on the global `fetch`; `decodeJwtPayload`
also uses Node's `Buffer`). `jose` is a runtime dependency used for JWT verification.

The package is ESM-only (`"type": "module"`) and exports both JavaScript and `.d.ts` types.

## Quick start

```ts
import {
  fetchOIDCDiscovery,
  exchangeToken,
  validateJwt,
  getUserInfo,
} from "@eetr/eetr-auth-client";

const ISSUER = "https://auth.example.com";

// 1. Discover endpoints
const discovery = await fetchOIDCDiscovery(ISSUER);

// 2. Exchange an authorization code for tokens (PKCE)
const tokens = await exchangeToken(
  {
    grantType: "authorization_code",
    clientId: "my-client",
    code: authorizationCode,
    redirectUri: "https://app.example.com/callback",
    codeVerifier,
  },
  { tokenEndpoint: discovery.token_endpoint }
);

// 3. Verify the access/ID token against the server's JWKS
const payload = await validateJwt(tokens.access_token, discovery.jwks_uri, {
  issuer: ISSUER,
  audience: "my-client",
});

// 4. Fetch the user's profile
const user = await getUserInfo(tokens.access_token, discovery.userinfo_endpoint);
```

## API reference

### Discovery

```ts
fetchOIDCDiscovery(issuerUrl: string): Promise<OIDCDiscovery>
fetchOAuthMetadata(issuerUrl: string): Promise<OAuthServerMetadata>
```

Fetch the server's `/.well-known/openid-configuration` or
`/.well-known/oauth-authorization-server` metadata. Use the returned
`token_endpoint`, `jwks_uri`, `userinfo_endpoint`, etc. to configure the rest of
the client rather than hard-coding paths.

### Token exchange

```ts
exchangeToken(params: ExchangeTokenParams, config: ExchangeTokenConfig): Promise<TokenResponse>
```

Performs an OAuth token request. `grantType` is one of `"authorization_code"`,
`"client_credentials"`, or `"refresh_token"`; supply the fields relevant to the grant.

```ts
// Client credentials (machine-to-machine)
const tokens = await exchangeToken(
  {
    grantType: "client_credentials",
    clientId: "service-a",
    clientSecret: process.env.CLIENT_SECRET,
    scope: "admin",
  },
  { tokenEndpoint: discovery.token_endpoint }
);
```

On a non-2xx response it throws an [`OAuthError`](#error-handling) carrying the
server's `error` code and `error_description`.

### TokenManager

A small helper that caches an access token and transparently refreshes it (using a
30-second expiry skew) when a refresh token is available.

```ts
import { TokenManager } from "@eetr/eetr-auth-client";

const manager = new TokenManager({
  issuerUrl: ISSUER,
  clientId: "my-client",
  clientSecret: process.env.CLIENT_SECRET, // optional for public clients
  tokenEndpoint: discovery.token_endpoint,
});

manager.setTokens(tokens);        // seed from an initial exchange
const accessToken = await manager.getAccessToken(); // refreshes if expired
```

`getAccessToken()` throws an `OAuthError` with code `no_token` if there is no valid
token and no refresh token to fall back on.

### JWT verification

```ts
validateJwt(token: string, jwksUri: string, options?: ValidateJwtOptions): Promise<JWTPayload>
decodeJwtPayload(token: string): JWTPayload
```

`validateJwt` verifies the signature against the server's JWKS (remote keys are
cached per `jwksUri`) and validates `issuer`/`audience`/expiry (`clockTolerance`
defaults to 5 seconds). `decodeJwtPayload` decodes the payload **without** verifying
the signature — use it only for inspecting claims you have already verified.

```ts
const payload = await validateJwt(accessToken, discovery.jwks_uri, {
  issuer: ISSUER,
  audience: "my-client",
  clockTolerance: 10,
});
```

### Token introspection

```ts
introspectToken(params: IntrospectTokenParams, config: IntrospectTokenConfig): Promise<TokenValidationResponse>
```

Asks the server whether a token is active within a given environment. The endpoint
is published as `token_introspection_endpoint` in the OAuth metadata (defaults to
`${ISSUER}/api/token/validate`).

```ts
const metadata = await fetchOAuthMetadata(ISSUER);

const result = await introspectToken(
  { token: accessToken, scopes: ["read"], environmentName: "production" },
  { introspectionEndpoint: metadata.token_introspection_endpoint! }
);
// → { valid, active, client_id, expires_at }
```

### UserInfo

```ts
getUserInfo(accessToken: string, userInfoEndpoint: string): Promise<UserInfoResponse>
```

Returns the OIDC UserInfo claims (`sub`, `name`, `email`, `picture`, …) for the
bearer token. Throws `OAuthError` on failure.

### Admin API

User management against the server's admin API. Requires an access token from a
client configured as an **admin API client** on the server.

```ts
import {
  getAdminUser,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
} from "@eetr/eetr-auth-client";

const config = { baseUrl: ISSUER, accessToken }; // AdminClientConfig

const created = await createAdminUser(
  { username: "alice", password: "•••", email: "alice@example.com" },
  config
);

await updateAdminUser("alice", { name: "Alice B." }, config);
const user = await getAdminUser("alice", config); // by username or UUID
await deleteAdminUser(created.id, config);
```

All admin calls throw `OAuthError` on non-2xx responses.

### Passkey management

List, rename, and remove a user's passkeys. The access token must belong to the
user whose passkeys are being managed.

```ts
import { listPasskeys, renamePasskey, removePasskey } from "@eetr/eetr-auth-client";

const config = { baseUrl: ISSUER, accessToken }; // UserClientConfig

const passkeys = await listPasskeys(config);
await renamePasskey(passkeys[0].id, "Work laptop", config);
await removePasskey(passkeys[0].id, config);
```

> Only passkey *management* is available here. Creating or authenticating with a
> passkey is a WebAuthn ceremony that requires a browser and cannot be driven from a
> server-side client. `removePasskey` deletes the server-side record only — it does
> not remove the credential from the device/authenticator.

## Error handling

API helpers throw `OAuthError` (a subclass of `Error`) on non-2xx responses, exposing
the server's machine-readable `code` alongside the message:

```ts
import { OAuthError } from "@eetr/eetr-auth-client";

try {
  await exchangeToken(params, config);
} catch (err) {
  if (err instanceof OAuthError) {
    console.error(err.code, err.message); // e.g. "invalid_grant"
  }
}
```

The discovery helpers throw a plain `Error` with the HTTP status on failure.

## Types

The package exports TypeScript types for every request and response shape, including
`TokenResponse`, `UserInfoResponse`, `OIDCDiscovery`, `OAuthServerMetadata`,
`AuthClientConfig`, `JWTPayload`, `TokenValidationResponse`, `GrantType`,
`ExchangeTokenParams`/`Config`, `IntrospectTokenParams`/`Config`, `AdminUserRecord`,
`AdminClientConfig`, `CreateUserParams`, `UpdateUserParams`, `PasskeySummary`, and
`UserClientConfig`.

## License

See the [eetr-auth repository](https://github.com/eetr-ai/eetr-auth).
