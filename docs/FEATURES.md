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
- `/userinfo` — OpenID Connect userinfo endpoint (requires an access token with the `openid`
  scope; claims are gated by scope — `profile` → name/preferred_username/picture, `email` →
  email/email_verified, mirroring the id_token)
- JWKS endpoint served from R2 CDN for public key verification
- ID tokens signed with RS256 (asymmetric key pair, rotatable)

---

## User Authentication

### Password Authentication
- Passwords hashed with **Argon2id** via the `argon-hasher` Cloudflare Worker
- Configurable fallback hash method via `HASH_METHOD` environment variable
- Password reset via time-limited JWT token sent to email. Single-use and DB-backed;
  requesting a new reset purges earlier pending links, and any password change (admin,
  self-service, or another reset) invalidates outstanding reset links

### Password Policies
Per-environment password policies are managed from **Setup → Password policies**.
- A policy is a named rule set: **enabled** flag, complexity rules (min length,
  optional max length, a **minimum count** of uppercase / lowercase / number / special
  characters — `0` = not required, so a value of `2` demands at least two of that class —
  and "must not contain the username or email local-part"), and a **max password age**
  (days; `0` = never expires).
- A policy can be assigned to **one or more environments**, but each environment may
  hold **at most one** policy (enforced by a `UNIQUE` constraint and surfaced in the UI).
- **Admins** don't belong to an environment (a regular user's environment is derived from
  the client id used at sign-in). A single **admin sign-in policy** is therefore selected
  globally at the top of the Password policies tab and stored on the `site_settings`
  singleton (`admin_password_policy_id`); `None` enforces no policy for admins.
- **Max-age enforcement at login:** when a user signs in, the applicable max age is
  applied — for admins, the admin sign-in policy; for everyone else, the strictest enabled
  max age across the environments they are granted (via user↔environment access). If their
  password is older, sign-in is halted **before MFA** and a reset is forced — a reset link
  is emailed when delivery is configured, otherwise the user is directed to an
  administrator. Users whose password change predates this feature are never expired
  until their next password change.
- The complexity rules are validated by a shared utility and surfaced in the policy
  editor; enforcing them on password *set* (create/change/reset) is a planned follow-up.

### Passkeys (WebAuthn)
- Register and sign in with device passkeys (Touch ID, Face ID, hardware keys)
- Multi-device credential support
- Domain-based authenticator assertion with parent domain fallback
- Check if a user has a registered passkey via API

### Multi-Factor Authentication (MFA)
Two MFA methods are supported, chosen per user at sign-in by availability:
- **Email OTP** — site-wide: when an admin enables MFA, every user with an email
  receives a server-generated 6-digit code by email. Configurable max attempt limit
  via `MFA_OTP_MAX_ATTEMPTS`; challenge-response model with short-lived tokens.
- **Authenticator app (TOTP)** — per-user opt-in: a user enrolls an RFC 6238
  authenticator (e.g. Google Authenticator) from account settings. The base32 secret
  is stored encrypted at rest (AES-GCM, key derived from `AUTH_SECRET`). Enrolling
  turns on MFA for that user even when the site-wide email toggle is off.

At sign-in, the available methods are computed for the user: with **one** method it is
used directly; with **both** (site email MFA on *and* an authenticator enrolled) the
user picks at a chooser, and can switch to an email code as a fallback. The email code
is only sent once email is actually chosen.

### Email Verification
- New user email verification flow
- Resend verification email support
- Verification challenge stored in D1 with expiry

---

## Token Management

### Access Tokens
- Short-lived JWTs (RS256)
- Scoped per OAuth client grant
- Introspection endpoint (`POST /token/validate`) — optional `clientId` audience binding so a
  resource server only accepts tokens issued to itself (not a sibling client in the same environment)
- Activity logging on every use

### Refresh Tokens
- Long-lived, single-use with rotation
- Revocable (full token + associated refresh chain)
- Scope-preserved through rotation
- User environment access is re-checked on every refresh: revoking a user's access to a client's
  environment stops new tokens immediately rather than at the refresh token's natural expiry

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

### Environment Access
- Users are granted access to specific environments via a `users_environments` mapping
- Grants are edited inline in the admin Users list (and shown as badges per user)
- Drives per-user password-policy resolution (the login max-age gate)
- On upgrade, every existing user is granted every environment for backwards compatibility

### Admin Dashboard
- Full CRUD for users, including per-user environment grants
- View and manage OAuth clients
- Token activity log viewer
- Site identity / branding (title, logo, URL, CDN URL) via the setup wizard
- Password policies management (per-environment complexity rules + max password age)
- Initial setup wizard

### Admin API
- Bearer token protected (client credential JWT)
- Admin operations: create/update/delete users, manage tokens

---

## Security

| Feature | Detail |
|---|---|
| Password hashing | Argon2id via isolated WASM Worker |
| Password policies | Per-environment complexity rules + max password age enforced at login |
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
