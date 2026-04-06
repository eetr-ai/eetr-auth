# eetr-auth Monorepo Migration Plan

## Overview

Convert `eetr-auth` into an npm monorepo that:

1. Moves `argon-hasher` into `apps/argon-hasher/`
2. Imports `progression-ai-auth` with its full git history into `apps/auth/` as a clean Cloudflare template (no instance-specific wrangler configs)
3. Adds a coordinated deploy pipeline (argon-hasher must deploy before auth)
4. Creates `@eetr/eetr-auth-client` — a published TypeScript client library

---

## Target Structure

```
eetr-auth/
├── package.json                   # npm workspace root
├── .gitignore
├── PLAN.md
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DEPLOYMENT.md
│   ├── FEATURES.md
│   └── CLOUDFLARE_TEMPLATE.md
├── apps/
│   ├── argon-hasher/              # Rust/Wasm Cloudflare Worker
│   │   ├── Cargo.toml
│   │   ├── wrangler.toml
│   │   └── src/lib.rs
│   └── auth/                      # Next.js + Cloudflare OAuth/OIDC server
│       ├── package.json           # name: "auth"
│       ├── wrangler.jsonc         # clean template (no real IDs)
│       ├── next.config.ts
│       ├── open-next.config.ts
│       ├── tsconfig.json
│       ├── worker.ts
│       ├── src/
│       ├── db/
│       ├── scripts/
│       └── infra/terraform/
└── packages/
    └── eetr-auth-client/          # @eetr/eetr-auth-client
        ├── package.json
        ├── tsconfig.json
        └── src/
```

---

## Plan Status

### Phase 1 — Repo Restructure

- [ ] **1.1** Create `apps/` directory and move `argon-hasher/` → `apps/argon-hasher/` via `git mv`
- [ ] **1.2** Create root `package.json` with npm workspaces config (see spec below)
- [ ] **1.3** Create root `.gitignore` covering all workspaces

### Phase 2 — Import progression-ai-auth with History

- [ ] **2.1** Add `upstream-auth` remote pointing to local `progression-ai-auth` repo
- [ ] **2.2** `git subtree add --prefix=apps/auth upstream-auth main` to merge with history
- [ ] **2.3** Remove upstream remote after import
- [ ] **2.4** Delete `apps/auth/wrangler.jsonc` (progression-ai-specific) and `apps/auth/wrangler.generated.jsonc` if present
- [ ] **2.5** Rename `apps/auth/package.json` `name` field from `progression-ai-auth` → `auth`
- [ ] **2.6** Search and replace any hardcoded `progression-ai-auth` worker references in scripts

### Phase 3 — Create Clean wrangler.jsonc Template

- [ ] **3.1** Create `apps/auth/wrangler.jsonc` with placeholder values (see spec below)
- [ ] **3.2** Verify `apps/auth/scripts/render-wrangler-config.mjs` outputs to `wrangler.generated.jsonc` correctly
- [ ] **3.3** Add `apps/auth/wrangler.generated.jsonc` to `.gitignore`

### Phase 4 — Deploy Orchestration

- [ ] **4.1** Add root-level deploy scripts to `package.json`:
  - `deploy:argon-hasher` — deploys the Rust worker first
  - `deploy:auth` — deploys the auth Next.js worker
  - `deploy` — runs both in order
- [ ] **4.2** Add `build` and `test` workspace pass-through scripts at root

### Phase 5 — @eetr/eetr-auth-client Package

- [ ] **5.1** Create `packages/eetr-auth-client/` directory
- [ ] **5.2** Create `package.json` (`@eetr/eetr-auth-client`, v0.1.0, ESM, with `jose` dep)
- [ ] **5.3** Create `tsconfig.json` (strict, ESM, outputs to `dist/`)
- [ ] **5.4** Implement `src/types.ts` — TypeScript interfaces for all API contracts
- [ ] **5.5** Implement `src/discovery.ts` — OIDC / OAuth metadata fetchers
- [ ] **5.6** Implement `src/api.ts` — typed fetch wrappers for every endpoint
- [ ] **5.7** Implement `src/tokens.ts` — `TokenManager` class (get/refresh/revoke)
- [ ] **5.8** Implement `src/jwt.ts` — JWT validation via JWKS + decode utility
- [ ] **5.9** Implement `src/index.ts` — re-export all public API
- [ ] **5.10** Verify `npm run build --workspace=packages/eetr-auth-client` succeeds

### Phase 6 — Documentation

- [x] **6.1** Create `docs/ARCHITECTURE.md` — system overview, package breakdown, bindings, flows
- [x] **6.2** Create `docs/FEATURES.md` — full feature listing across OAuth, users, infra, client lib
- [x] **6.3** Create `docs/DEPLOYMENT.md` — step-by-step deploy, local dev, env var reference
- [x] **6.4** Create `docs/CLOUDFLARE_TEMPLATE.md` — guide for using this as a Cloudflare template

### Phase 7 — Verification

- [ ] **7.1** `npm install` at root resolves all workspaces cleanly
- [ ] **7.2** `cargo check --target wasm32-unknown-unknown` inside `apps/argon-hasher/`
- [ ] **7.3** `npm run build --workspace=apps/auth` succeeds
- [ ] **7.4** `npm run test --workspace=apps/auth` passes
- [ ] **7.5** `npm run build --workspace=packages/eetr-auth-client` succeeds
- [ ] **7.6** `git log --oneline apps/auth/` shows history from progression-ai-auth

---

## Implementation Specs

### Root package.json

```json
{
  "name": "eetr-auth-monorepo",
  "private": true,
  "workspaces": [
    "apps/auth",
    "packages/*"
  ],
  "scripts": {
    "deploy:argon-hasher": "cd apps/argon-hasher && npx wrangler deploy",
    "deploy:auth": "npm run deploy --workspace=apps/auth",
    "deploy": "npm run deploy:argon-hasher && npm run deploy:auth",
    "build": "npm run build --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present"
  }
}
```

> Note: `apps/argon-hasher` is NOT an npm workspace — it's a Cargo project. It gets its own dedicated root script.

### apps/auth/wrangler.jsonc (clean template)

```jsonc
{
  "name": "eetr-auth",
  "main": ".open-next/worker.js",
  "compatibility_date": "2024-12-30",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS"
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "REPLACE_WITH_YOUR_D1_NAME",
      "database_id": "REPLACE_WITH_YOUR_D1_ID"
    }
  ],
  "r2_buckets": [
    {
      "binding": "BLOG_IMAGES",
      "bucket_name": "REPLACE_WITH_YOUR_R2_BUCKET"
    }
  ],
  "images": { "binding": "IMAGES" },
  "services": [
    { "binding": "WORKER_SELF_REFERENCE", "service": "eetr-auth" },
    {
      "binding": "ARGON_HASHER",
      "service": "argon-hasher",
      "entrypoint": "ArgonHasherWorker"
    }
  ],
  "vars": {
    "AUTH_URL": "REPLACE_WITH_YOUR_AUTH_URL",
    "ISSUER_BASE_URL": "REPLACE_WITH_YOUR_ISSUER_URL",
    "JWKS_CDN_BASE_URL": "REPLACE_WITH_YOUR_JWKS_CDN_URL",
    "JWKS_R2_KEY": "jwks.json",
    "CLIENT_KEY_PREFIX": "eetr",
    "HASH_METHOD": "argon",
    "MFA_OTP_MAX_ATTEMPTS": "5"
  },
  "triggers": { "crons": ["0 0 * * *"] },
  "observability": { "enabled": true }
}
```

### @eetr/eetr-auth-client — Public API Surface

| Module | Exports |
|---|---|
| `types.ts` | `TokenResponse`, `UserInfoResponse`, `OIDCDiscovery`, `OAuthServerMetadata`, `AuthClientConfig`, `JWTPayload` |
| `discovery.ts` | `fetchOIDCDiscovery(issuerUrl)`, `fetchOAuthMetadata(issuerUrl)` |
| `api.ts` | `exchangeToken(params, config)`, `introspectToken(token, config)`, `revokeToken(token, config)`, `getUserInfo(accessToken, userInfoEndpoint)` |
| `tokens.ts` | `class TokenManager` — `getAccessToken()`, `refresh(refreshToken)`, `revoke(token)` |
| `jwt.ts` | `validateJwt(token, jwksUri, options?)`, `decodeJwtPayload(token)` |
| `index.ts` | Re-exports everything above |
