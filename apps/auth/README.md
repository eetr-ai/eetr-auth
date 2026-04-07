# OpenNext Starter

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

Read the documentation at https://opennext.js.org/cloudflare.

## Develop

Run the Next.js development server:

```bash
npm run dev
# or similar package manager command
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Local Setup

For local sign-in and password-reset testing, bootstrap local D1 from the current clean-slate schema, then create an admin user and site URL:

```bash
npm run db:migrate
npm run db:create-user:local -- <username> <email>
npm run db:set-site-url:local -- https://auth.example.com
```

If you pass arguments to npm scripts, prefer `--` before script args.

## Email Verification

- Non-admin users now start with `email_verified_at = NULL`.
- If site MFA is enabled, a successful email OTP sign-in also marks the user email as verified.
- If site MFA is disabled, unverified non-admin users must complete a one-time email verification OTP during sign-in.
- If a non-admin user changes email, verification is cleared and a new verification code can be requested through:
  - `POST /api/users/email-verification/request`
  - `POST /api/users/email-verification/verify`
- OpenID Connect `GET /api/userinfo` now includes the standard `email_verified` claim.

## Preview

Preview the application locally on the Cloudflare runtime:

```bash
npm run preview
# or similar package manager command
```

## Deploy

Deploy the application to Cloudflare:

```bash
npm run deploy
# or similar package manager command
```

**New environment (Terraform + generated Wrangler config):** see [infra/INSTALL.md](infra/INSTALL.md). After provisioning, deploy with `npm run deploy:infra` (uses `wrangler.generated.jsonc`).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## OAuth 2.1 Endpoints

This project now exposes OAuth authorization server endpoints for:

- `authorization_code` with PKCE (`S256` only)
- `client_credentials`
- `refresh_token`

### API Reference (Scalar)

- Interactive docs: `GET /api/docs`
- OpenAPI document (JSON): `GET /api/openapi`

### Authorization endpoint

- `GET` or `POST` `/api/authorize`
- Required params: `response_type=code`, `client_id`, `redirect_uri`, `code_challenge`, `code_challenge_method=S256`
- Optional params: `scope`, `state`
- Behavior:
  - validates client and redirect URI ownership
  - validates requested scopes against client grants
  - issues short-lived authorization codes
  - redirects to `redirect_uri` with `code` and `state`

### Token endpoint

- `POST` `/api/token`
- Client authentication:
  - `client_secret_basic` via `Authorization: Basic ...`
  - fallback `client_id` + `client_secret` in request body
- Supported grants:
  - `grant_type=client_credentials` (optional `scope`)
  - `grant_type=authorization_code` (requires `code`, `redirect_uri`, `code_verifier`)
  - `grant_type=refresh_token` (requires `refresh_token`, optional narrowed `scope`)
- Response headers include:
  - `Cache-Control: no-store`
  - `Pragma: no-cache`

### Token validation endpoint

- `POST` `/api/token/validate`
- Token input can be provided as:
  - `Authorization: Bearer <token>` header (preferred)
  - or `token` field in request body
- Accepts JSON or form body with:
  - `token` (optional when using Bearer header): opaque access token from `/api/token`
  - `environmentName` (required): environment name the token must belong to
  - `scopes` (optional): array of required scopes, or whitespace-separated scope string
- Returns:
  - always returns only these fields:
    - `valid` (boolean)
    - `active` (boolean)
    - `client_id` (string or `null`)
    - `expires_at` (ISO string or `null`)
- Response shape policy:
  - on invalid responses, `client_id` and `expires_at` are `null`
- Status codes:
  - `200` when fully valid
  - `401` for every non-valid case (invalid token, expired token, scope mismatch, environment mismatch, or missing `environmentName`)

### Token cleanup schedule

- Cleanup runs as a Cloudflare Worker Cron Trigger (`scheduled` handler), not an HTTP endpoint.
- Schedule: daily at `00:00 UTC` via Wrangler `triggers.crons` (`0 0 * * *`).
- Cleanup targets:
  - expired access tokens
  - expired refresh tokens
  - revoked refresh tokens
  - used or expired authorization codes
- Observability:
  - emits structured logs with run metadata, per-table deleted counts, total deleted, status (`success` or `error`), and error details when failures occur

### Token persistence and admin visibility

- Access tokens are stored in `tokens` + `token_scopes`
- Authorization codes are stored in `authorization_codes` + `authorization_code_scopes`
- Refresh tokens are stored in `refresh_tokens` + `refresh_token_scopes` with rotation lineage
- Admin UI:
  - `/dashboard/tokens` for global token activity
  - `/dashboard/clients/[id]` for per-client token activity
  - revoke and delete actions for access/refresh tokens are available from the dashboard UI only

### User model and admin access

- Dashboard authentication uses the `users` table with:
  - `id`, `username`, `email`, `email_verified_at`, `password_hash`, `is_admin`
- Only users with `is_admin = 1` can sign in and access `/dashboard`.
- User management (create, update, delete) is available at `/dashboard/users`.
- Bootstrap admin user commands:
  - `npm run db:create-user -- <username> <email>`
  - `npm run db:create-user:local -- <username> <email>`
  - `npm run db:create-user:remote -- --config wrangler.generated.jsonc <username> <email>`
  - the script stores a random placeholder password hash; users should complete setup through the password reset flow

### Admin users API (client-credential JWT)

- Endpoints:
  - `POST /api/admin/users`
  - `PUT /api/admin/users/{id}`
  - `DELETE /api/admin/users/{id}`
- Auth model:
  - requires `Authorization: Bearer <access_token>`
  - token must be valid and the token client must be selected in Setup > Admin API clients
  - requests from valid but non-selected clients return `403`
- Avatar behavior:
  - these admin endpoints do not handle avatar uploads
  - avatar upload remains on `POST /api/users/avatar` using the existing user JWT/session flow

### Site URL setup (required for password reset emails)

- Set in both local + remote D1:
  - `npm run db:set-site-url -- https://auth.example.com`
- Set in local D1 only:
  - `npm run db:set-site-url:local -- https://auth.example.com`
- Remote only with generated Wrangler config:
  - `npm run db:set-site-url:remote -- --config wrangler.generated.jsonc https://auth.example.com`
