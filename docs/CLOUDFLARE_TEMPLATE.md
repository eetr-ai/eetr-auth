# Using eetr-auth as a Cloudflare Template

This project is designed to be used as a reusable Cloudflare Workers template. You can fork it, configure it for your domain, and deploy a fully functional OAuth 2.1 + OpenID Connect server to Cloudflare's edge in minutes.

---

## What You Get

- A production-ready OAuth 2.1 / OpenID Connect authorization server
- Argon2id password hashing via an isolated Cloudflare Worker
- Admin dashboard for managing users, clients, and tokens
- Passkey (WebAuthn) support
- Multi-factor auth — email OTP (site-wide) and authenticator-app TOTP (per-user, RFC 6238) — plus email verification
- Cloudflare D1 (SQLite) for persistence
- Cloudflare R2 for JWKS, avatars, and site assets
- A published TypeScript client library (`@eetr/eetr-auth-client`) for consuming the server

---

## What You Need to Provide

| Requirement | Where Used |
|---|---|
| Cloudflare account (Workers, D1, R2, Images) | All infrastructure |
| Custom domain (recommended) | `AUTH_URL`, `ISSUER_BASE_URL` |
| Resend API key | Transactional email (password reset, MFA, verification) |
| Terraform CLI | Provisioning D1 + R2 |

---

## Step 1 — Fork or Clone the Template

```bash
git clone https://github.com/eetr-ai/eetr-auth.git my-auth-server
cd my-auth-server
npm install
```

---

## Step 2 — Customize the Worker Name

The auth worker is named `eetr-auth` by default. To use a custom name, set `worker_name` in
`infra/terraform/terraform.tfvars`:

```hcl
worker_name = "my-auth-server"
```

The Wrangler config (`wrangler.generated.jsonc`) is rendered from `infra/wrangler.template.jsonc` during
`npm run setup:remote`, and the `WORKER_SELF_REFERENCE` service binding is generated to match `worker_name`
automatically — you do not edit a Wrangler file by hand.

> You do not need to rename `argon-hasher` — it is a shared internal service and its name is fixed in the
> `ARGON_HASHER` service binding.

---

## Step 3 — Configure Your Domain

Set the domain/subdomain where the auth server will be accessible — it is used in OAuth flows and email
links. Configure these in `infra/terraform/terraform.tfvars`; they are written into the rendered
Wrangler config automatically:

```hcl
issuer_base_url   = "https://auth.yourdomain.com"
auth_url          = "https://auth.yourdomain.com/api/auth/session"  # full Auth.js session endpoint
jwks_cdn_base_url = "https://cdn.yourdomain.com"
```

---

## Step 4 — Provision and Deploy

See [DEPLOYMENT.md](./DEPLOYMENT.md#clean-install) for the full step-by-step guide. In summary, from the
repository root:

```bash
# 1. Provision D1 + R2
cd infra/terraform && terraform init && terraform apply && cd -

# 2. Deploy the password hasher, then run automated setup
npm run deploy:argon-hasher
npm run setup:remote
```

`npm run setup:remote` renders `wrangler.generated.jsonc`, provisions secrets and JWT/JWKS material, applies
the database schema, deploys the auth Worker, and seeds the bootstrap admin (`admin` / `admin`). Harden that
account immediately after first login — see DEPLOYMENT.md.

> To redeploy later without re-running setup, use `npm run deploy` from the repository root (it deploys
> `argon-hasher` first, then `apps/auth`).

---

## Step 6 — Register Your First OAuth Client

After deployment, log in to the admin dashboard at `https://auth.yourdomain.com/dashboard` with the admin credentials you created.

1. Go to **Clients** → **New Client**
2. Enter a name and redirect URIs for your application
3. Note the generated `client_id` and `client_secret`
4. Grant the required scopes

---

## Step 7 — Integrate with Your Application

Install the client library:

```bash
npm install @eetr/eetr-auth-client
```

### Authorization Code + PKCE (browser apps)

```typescript
import { fetchOIDCDiscovery, TokenManager } from '@eetr/eetr-auth-client'

const discovery = await fetchOIDCDiscovery('https://auth.yourdomain.com')

// Use discovery.authorization_endpoint for your redirect
// Use discovery.token_endpoint with TokenManager for token exchange
const manager = new TokenManager({
  issuerUrl: 'https://auth.yourdomain.com',
  clientId: 'your-client-id',
  tokenEndpoint: discovery.token_endpoint,
})
```

### Client Credentials (backend services)

```typescript
import { exchangeToken } from '@eetr/eetr-auth-client'

const tokens = await exchangeToken({
  grantType: 'client_credentials',
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
  scope: 'read:users',
}, {
  tokenEndpoint: 'https://auth.yourdomain.com/api/token',
})
```

### Validate a JWT (server-side)

```typescript
import { validateJwt } from '@eetr/eetr-auth-client'

const payload = await validateJwt(
  accessToken,
  'https://auth.yourdomain.com/api/jwks.json'
)
```

---

## Customization Points

### Site identity & branding

Configure these in the admin dashboard under **Dashboard → Setup → Site identity**:

- **Site title** — display name shown on the sign-in/authorize pages and in transactional emails; it is also the issuer label your users see when they enroll an authenticator app (TOTP).
- **Site logo** — image upload (JPEG/PNG/WebP, up to 5 MB) stored in R2; shown on the sign-in page and embedded in emails. Clearing it reverts to the default logo.
- **Site URL** — the public auth URL; required so transactional email (password reset, MFA codes) can build working links.
- **CDN URL** — optional public base URL used to serve the uploaded logo.

> Only the title and logo are visual branding — there is no theme/color, font, or favicon customization.

### Deployment configuration

These are deployment knobs, not branding:

- **Worker name** — set `worker_name` in `infra/terraform/terraform.tfvars`.
- **Client ID prefix** — change the `CLIENT_KEY_PREFIX` var in `infra/wrangler.template.jsonc` (e.g. `myapp`).

### Email

The server uses [Resend](https://resend.com) for transactional email. Templates are defined in `apps/auth/src/lib/email/`. You can customize the HTML/text content there.

### Scopes

Default scopes are seeded during `db:bootstrap`. Add custom scopes in the admin dashboard → Scopes or by modifying the bootstrap script.

### Password Hashing

The default is `argon` (Argon2id via the `argon-hasher` worker). To use an alternative method, set `HASH_METHOD` in `infra/wrangler.template.jsonc` and implement the hash interface in `apps/auth/src/lib/auth/`.

---

## What Is NOT Committed (Template Boundaries)

These files contain instance-specific values and are **gitignored** — you generate them locally:

| File | Description |
|---|---|
| `apps/auth/wrangler.generated.jsonc` | Generated from Terraform with real D1/R2 IDs |
| `infra/out/terraform.tf.json` | Terraform output JSON |
| `infra/terraform/terraform.tfvars` | Your account ID and resource names |
| `apps/auth/.env.local` | Local env vars |
| `apps/auth/.dev.vars` | Wrangler local dev secrets |

The committed `infra/wrangler.template.jsonc` is the **template** — it contains placeholders that get rendered into `wrangler.generated.jsonc` by the infra scripts (`infra:render-wrangler`, run as part of `setup:remote`).

---

## Updating the Template

To pull in upstream changes after you've deployed your instance:

```bash
git remote add upstream https://github.com/eetr-ai/eetr-auth.git
git fetch upstream
git merge upstream/main
```

Then re-run the automated upgrade, which applies any new versioned schema patches from `db/patches/`
(via `db:migrate:remote`), refreshes config, provisions only missing secrets, and redeploys:

```bash
npm run upgrade:remote
```

See [DEPLOYMENT.md](./DEPLOYMENT.md#upgrade-existing-deployment) for details.
