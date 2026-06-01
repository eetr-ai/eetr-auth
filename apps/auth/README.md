# @eetr/auth

OAuth 2.1 + OpenID Connect authorization server for Cloudflare Workers, built with Next.js and deployed via
[OpenNext](https://opennext.js.org/cloudflare). It issues and validates tokens, manages OAuth clients and
users, and ships an admin dashboard. It supports the `authorization_code` (PKCE, `S256` only),
`client_credentials`, and `refresh_token` grants.

## Local development

Bootstrap a brand-new local environment in one command:

```bash
npm run setup:local
```

This creates `.env.local` and `.dev.vars`, sets `HASH_METHOD=md5` for local-only hashing, generates auth
and JWT signing material (plus `.tmp/jwks.json`), applies `db/schema.sql` to local D1, and seeds an `admin` /
`admin` user (MD5-hashed, for development only).

Then start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

To refresh only the local env files and secrets without touching the database, run `npm run setup:local:env`.
Pass script arguments after `--` (e.g. `npm run db:set-site-url:local -- https://auth.example.com`). Passkey
testing may require HTTPS — expose the dev server through a tunnel with a valid TLS certificate.

## Email verification

- Non-admin users start with `email_verified_at = NULL`.
- With site MFA enabled, a successful email OTP sign-in also verifies the email.
- With site MFA disabled, unverified non-admin users complete a one-time email verification OTP at sign-in.
- Changing a non-admin user's email clears verification; a new code is requested via
  `POST /api/users/email-verification/request` and confirmed via `POST /api/users/email-verification/verify`.
- `GET /api/userinfo` includes the standard `email_verified` OIDC claim.

## Documentation

- **API reference** — interactive docs at `GET /api/docs`; OpenAPI document at `GET /api/openapi`.
- **Features** (grants, tokens, passkeys, admin API, site URL) — [../../docs/FEATURES.md](../../docs/FEATURES.md).
- **Architecture** (services, bindings, flows) — [../../docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).
- **Deployment & fresh install** — [../../docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md).
- **Database schema & admin user commands** — [db/README.md](db/README.md).
