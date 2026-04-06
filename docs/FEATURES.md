# Features

## OAuth 2.1 + OpenID Connect

### Supported Grant Types

| Grant Type | Description |
|---|---|
| Authorization Code + PKCE (S256) | Primary flow for user-facing apps. PKCE is mandatory. |
| Client Credentials | Machine-to-machine access. Scoped to registered clients. |
| Refresh Token | Silent token renewal with rotation on each use. |

> Authorization Code without PKCE is not supported — this is intentional per OAuth 2.1.

### OIDC Compliance

- `/.well-known/openid-configuration` — full OIDC discovery metadata
- `/.well-known/oauth-authorization-server` — RFC 8414 OAuth server metadata
- `/userinfo` — OpenID Connect userinfo endpoint (Bearer token required)
- JWKS endpoint served from R2 CDN for public key verification
- ID tokens signed with RS256 (asymmetric key pair, rotatable)

---

## User Authentication

### Password Authentication
- Passwords hashed with **Argon2id** via the `argon-hasher` Cloudflare Worker
- Configurable fallback hash method via `HASH_METHOD` environment variable
- Password reset via time-limited JWT token sent to email

### Passkeys (WebAuthn)
- Register and sign in with device passkeys (Touch ID, Face ID, hardware keys)
- Multi-device credential support
- Domain-based authenticator assertion with parent domain fallback
- Check if a user has a registered passkey via API

### Multi-Factor Authentication (MFA)
- Time-based OTP sent via email (not TOTP app — server generates and emails the code)
- Configurable max attempt limit via `MFA_OTP_MAX_ATTEMPTS`
- Challenge-response model with short-lived tokens

### Email Verification
- New user email verification flow
- Resend verification email support
- Verification challenge stored in D1 with expiry

---

## Token Management

### Access Tokens
- Short-lived JWTs (RS256)
- Scoped per OAuth client grant
- Introspection endpoint (`POST /token/validate`)
- Activity logging on every use

### Refresh Tokens
- Long-lived, single-use with rotation
- Revocable (full token + associated refresh chain)
- Scope-preserved through rotation

### Authorization Codes
- Single-use, short-lived
- PKCE verifier validation (S256 only)
- Redirect URI exact-match validation

### Token Cleanup
- Scheduled daily cron job (`0 0 * * *`) removes expired tokens, codes, and challenges from D1

---

## Client Management

### OAuth Clients
- Multi-tenant: each client belongs to an environment
- Per-client scope grants
- Multiple redirect URIs per client
- Client credentials support (hashed secret)
- Configurable client ID prefix (`CLIENT_KEY_PREFIX`)

### Scopes
- Custom scope definitions
- Per-client scope allowlist
- Scope propagation through token rotation

---

## User Management

### User Profiles
- Username, email, avatar
- Avatar upload to R2 (via Cloudflare Images API)
- Self-service profile update
- Gravatar-compatible avatar fallback (MD5-based)

### Admin Dashboard
- Full CRUD for users
- View and manage OAuth clients
- Token activity log viewer
- Site configuration (logo, URL)
- Initial setup wizard

### Admin API
- Bearer token protected (client credential JWT)
- Admin operations: create/update/delete users, manage tokens

---

## Security

| Feature | Detail |
|---|---|
| Password hashing | Argon2id via isolated WASM Worker |
| Token signing | RS256 asymmetric JWT |
| Token MAC | HMAC-SHA256 for request signing |
| PKCE | S256 mandatory for Authorization Code flow |
| Session encryption | AUTH_SECRET via NextAuth.js |
| Service isolation | argon-hasher rejects non-service-binding calls (403) |
| Redirect URI validation | Exact match required |

---

## Infrastructure

### Cloudflare Platform

| Resource | Usage |
|---|---|
| **Workers** | auth (Next.js/OpenNext), argon-hasher (Rust/WASM) |
| **D1** | All relational data (SQLite) |
| **R2** | JWKS JSON, user avatars, site logo |
| **Images** | Cloudflare Image Optimization for avatars |
| **Cron Triggers** | Daily token cleanup |

### Terraform Provisioning
- Automated D1 + R2 provisioning via Cloudflare Terraform provider
- Outputs fed into `wrangler.generated.jsonc` for deployment
- Infrastructure state checked into `infra/terraform/terraform.tfstate`

---

## Client Library (`@eetr/eetr-auth-client`)

| Feature | Detail |
|---|---|
| OIDC discovery | Fetch and parse server metadata from `/.well-known/openid-configuration` |
| Token exchange | Typed `exchangeToken()` for all grant types |
| Token introspection | `introspectToken()` against `/token/validate` |
| Token revocation | `revokeToken()` |
| User info | `getUserInfo()` against `/userinfo` |
| Token lifecycle | `TokenManager` — automatic refresh, revocation |
| JWT validation | Validate JWTs against server JWKS using `jose` |
| JWT decoding | Decode payload without verification (for inspecting claims) |
| TypeScript types | Full types for all API request/response shapes |
| Platform support | Browser, Node.js, Cloudflare Workers |

---

## Observability

- Cloudflare Workers observability enabled on both workers (`observability.enabled = true`)
- Token activity log table in D1 records every token use
- Admin dashboard includes token activity log view
