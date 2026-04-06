# Architecture

## System Overview

`eetr-auth` is a **Cloudflare-native OAuth 2.1 + OpenID Connect authorization server** packaged as an npm monorepo. It is designed to be deployed entirely on Cloudflare's edge platform with no traditional server infrastructure.

```mermaid
graph TB
    subgraph CF["Cloudflare Edge"]
        subgraph AUTH["apps/auth — Next.js 16 (OpenNext) Worker"]
            API["API Routes\n/token · /authorize · /userinfo\n/users · /admin"]
            UI["Admin Dashboard\n(Next.js UI)"]
            SVC["Service Layer\nOAuth · Tokens · Users · Passkeys · Email"]
            REPO["Repository Layer\n(D1 / SQL)"]

            API --> SVC
            UI --> SVC
            SVC --> REPO
        end

        HASHER["apps/argon-hasher\nRust/Wasm Worker\nPOST /hash · POST /verify\n(service binding only)"]

        D1[("Cloudflare D1\nSQLite Database")]
        R2[("Cloudflare R2\nJWKS · Avatars · Logo")]

        REPO --> D1
        SVC -->|ARGON_HASHER binding| HASHER
        SVC -->|WORKER_SELF_REFERENCE| AUTH
        SVC --> R2
    end

    CLIENT["packages/eetr-auth-client\n@eetr/eetr-auth-client\n(npm package)"]
    APP["Your Application"] -->|uses| CLIENT
    CLIENT -->|HTTP| API
```

---

## Monorepo Packages

### `apps/auth`

The core OAuth 2.1 / OIDC authorization server. Built with Next.js 16 (App Router) and deployed via OpenNext to Cloudflare Workers.

**Technology:**
- Next.js 16 + React 19 (App Router)
- Cloudflare Workers runtime via `@opennextjs/cloudflare`
- Cloudflare D1 (SQLite) for persistence
- Cloudflare R2 for object storage (JWKS, avatars, site logo)
- NextAuth.js v5 for admin session management

**Internal Architecture:**

```
src/
├── app/                    # Next.js App Router
│   ├── api/                # REST API routes (OAuth, users, admin)
│   └── (auth|admin)/       # UI pages (login, dashboard)
└── lib/
    ├── services/           # Business logic (19 services)
    ├── repositories/       # Data access layer (D1 implementations)
    ├── auth/               # Auth utilities (JWT, HMAC, cookies)
    ├── config/             # Runtime config readers
    ├── context/            # Dependency injection registry
    ├── crypto/             # Cryptographic primitives
    └── db/                 # D1 connection helper
```

**Cloudflare Bindings:**

| Binding | Type | Purpose |
|---|---|---|
| `DB` | D1 Database | All persistent data (users, tokens, clients, etc.) |
| `BLOG_IMAGES` | R2 Bucket | User avatars, site logo, JWKS JSON |
| `IMAGES` | Images API | Cloudflare image optimization |
| `ASSETS` | Static Assets | OpenNext-compiled static files |
| `WORKER_SELF_REFERENCE` | Service Binding | Internal self-calls for routing/caching |
| `ARGON_HASHER` | Service Binding | Password hash/verify operations |

---

### `apps/argon-hasher`

An internal-only Cloudflare Worker written in Rust (compiled to WebAssembly). It implements Argon2id password hashing and is exposed exclusively via service binding — it rejects all requests that do not carry the `internal: true` prop.

**Endpoints (internal only):**

| Method | Path | Description |
|---|---|---|
| POST | `/hash` | Hash a plaintext password with Argon2id |
| POST | `/verify` | Verify a password against an Argon2id hash |

**Security model:** The worker checks `ctx.props.internal === true`. Any request without this prop receives a `403 Forbidden`. This means it can never be called directly from the internet — only via the `ARGON_HASHER` service binding from `apps/auth`.

**Deployment constraint:** Must be deployed **before** `apps/auth`.

---

### `packages/eetr-auth-client`

A published TypeScript library (`@eetr/eetr-auth-client`) for consuming the auth server from client applications and backend services.

**Modules:**

| Module | Description |
|---|---|
| `types` | TypeScript interfaces for all API request/response shapes |
| `discovery` | Fetch OIDC discovery and OAuth server metadata |
| `api` | Typed fetch wrappers for all server endpoints |
| `tokens` | `TokenManager` — stateful access token lifecycle management |
| `jwt` | JWT validation against server JWKS + payload decoding |

**Design principles:**
- Zero framework dependencies — works in browser, Node.js, and Cloudflare Workers
- `jose` is the only runtime dependency (JWT operations)
- All functions accept explicit configuration rather than global singletons
- `TokenManager` uses in-memory storage by default; consumers can override for persistence

---

## Database Schema

The D1 database contains 23 tables organized around these domains:

```mermaid
erDiagram
    users {
        text id PK
        text username
        text email
        text password_hash
        text avatar_url
    }
    user_challenges {
        text id PK
        text user_id FK
        text type
        text token
        timestamp expires_at
    }
    environments {
        text id PK
        text name
    }
    clients {
        text id PK
        text environment_id FK
        text secret_hash
        text name
    }
    scopes {
        text id PK
        text name
    }
    authorization_codes {
        text code PK
        text client_id FK
        text user_id FK
        text code_challenge
        timestamp expires_at
    }
    tokens {
        text id PK
        text client_id FK
        text user_id FK
        timestamp expires_at
    }
    refresh_tokens {
        text id PK
        text token_id FK
        timestamp expires_at
    }
    passkeys {
        text id PK
        text user_id FK
        text credential_id
        text public_key
    }
    token_activity_log {
        text id PK
        text token_id FK
        timestamp used_at
    }

    users ||--o{ user_challenges : has
    users ||--o{ tokens : owns
    users ||--o{ passkeys : registers
    clients ||--o{ authorization_codes : issues
    clients }o--|| environments : belongs_to
    tokens ||--o| refresh_tokens : paired_with
    tokens ||--o{ token_activity_log : logged_in
```

---

## Authentication Flows

### Authorization Code + PKCE (S256)

```mermaid
sequenceDiagram
    participant App as Client App
    participant Auth as apps/auth
    participant Hasher as apps/argon-hasher
    participant D1 as Cloudflare D1

    App->>Auth: GET /api/authorize<br/>(client_id, code_challenge, scope)
    Auth->>App: Redirect → /login

    App->>Auth: POST /login<br/>(username, password)
    Auth->>Hasher: POST /verify<br/>(password, hash) [service binding]
    Hasher-->>Auth: { valid: true }
    Auth->>D1: Create authorization_code
    Auth->>App: Redirect → callback?code=xxx

    App->>Auth: POST /api/token<br/>(code, code_verifier, grant_type=authorization_code)
    Auth->>D1: Validate code + PKCE verifier
    Auth->>D1: Create token + refresh_token
    Auth-->>App: { access_token, refresh_token, id_token }
```

### Token Refresh

```mermaid
sequenceDiagram
    participant App as Client App
    participant Auth as apps/auth
    participant D1 as Cloudflare D1

    App->>Auth: POST /api/token<br/>(grant_type=refresh_token, refresh_token=xxx)
    Auth->>D1: Validate refresh_token (not expired, not used)
    Auth->>D1: Rotate — invalidate old, create new token pair
    Auth-->>App: { access_token, refresh_token }
```

### Client Credentials

```mermaid
sequenceDiagram
    participant Svc as Backend Service
    participant Auth as apps/auth
    participant D1 as Cloudflare D1

    Svc->>Auth: POST /api/token<br/>(grant_type=client_credentials,<br/>client_id, client_secret, scope)
    Auth->>D1: Validate client + secret hash
    Auth->>D1: Check scope grants
    Auth->>D1: Create access_token
    Auth-->>Svc: { access_token }
```

### Passkey Sign-In

```mermaid
sequenceDiagram
    participant Browser as Browser
    participant Auth as apps/auth
    participant D1 as Cloudflare D1

    Browser->>Auth: POST /api/auth/passkey/challenge
    Auth->>D1: Store challenge
    Auth-->>Browser: { challenge }

    Browser->>Browser: navigator.credentials.get()<br/>(authenticator assertion)

    Browser->>Auth: POST /api/auth/passkey/verify<br/>(assertion, challenge)
    Auth->>D1: Lookup credential + verify assertion
    Auth-->>Browser: Session cookie set → redirect
```

---

## Infrastructure

```mermaid
flowchart LR
    TF["Terraform\napps/auth/infra/terraform/"]
    TF -->|provisions| D1[("Cloudflare D1")]
    TF -->|provisions| R2[("Cloudflare R2")]
    TF -->|outputs| JSON["infra/out/terraform.tf.json"]
    JSON -->|render-wrangler script| WGEN["wrangler.generated.jsonc\n(gitignored)"]
    WGEN -->|wrangler deploy| AUTH["eetr-auth Worker"]
```

Terraform (`apps/auth/infra/terraform/`) provisions:
- Cloudflare D1 database
- Cloudflare R2 bucket

The `wrangler.generated.jsonc` (gitignored) is rendered from Terraform outputs via `npm run infra:render-wrangler` inside `apps/auth`.

---

## Deployment Order

```mermaid
flowchart TD
    A["1. Deploy apps/argon-hasher\nnpx wrangler deploy"] -->
    B["2. Terraform apply\nprovision D1 + R2"] -->
    C["3. infra:terraform-output\ninfra:render-wrangler"] -->
    D["4. jwt:setup-secrets\ninfra:provision\n(upload secrets + JWKS to R2)"] -->
    E["5. db:migrate:remote\ndb:create-admin:remote"] -->
    F["6. Deploy apps/auth\nnpm run deploy:auth"]
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full step-by-step instructions.
