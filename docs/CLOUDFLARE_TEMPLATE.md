# Using eetr-auth as a Cloudflare Template

This project is designed to be used as a reusable Cloudflare Workers template. You can fork it, configure it for your domain, and deploy a fully functional OAuth 2.1 + OpenID Connect server to Cloudflare's edge in minutes.

---

## What You Get

- A production-ready OAuth 2.1 / OpenID Connect authorization server
- Argon2id password hashing via an isolated Cloudflare Worker
- Admin dashboard for managing users, clients, and tokens
- Passkey (WebAuthn) support
- Email-based MFA and verification
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

The auth worker is named `eetr-auth` by default. If you want a custom name, update it in two places:

**`apps/auth/wrangler.jsonc`** — change the `name` field and the `WORKER_SELF_REFERENCE` service binding:

```jsonc
{
  "name": "my-auth-server",          // ← your worker name
  "services": [
    { "binding": "WORKER_SELF_REFERENCE", "service": "my-auth-server" },  // ← match above
    { "binding": "ARGON_HASHER", "service": "argon-hasher" }              // ← keep as-is
  ]
}
```

> You do not need to rename `argon-hasher` — it is a shared internal service and its name is fixed in the service binding.

---

## Step 3 — Configure Your Domain

Set your domain/subdomain where the auth server will be accessible. This is used in OAuth flows and email links.

You will set these values in `apps/auth/infra/terraform/terraform.tfvars` and they will be written to the rendered wrangler config automatically:

```hcl
site_url = "https://auth.yourdomain.com"
```

---

## Step 4 — Provision Infrastructure

See [DEPLOYMENT.md](./DEPLOYMENT.md#provision-infrastructure-first-time) for the full Terraform + secret provisioning steps.

In summary:

```bash
cd apps/auth/infra/terraform
terraform init
terraform apply

cd ../..
npm run infra:terraform-output
npm run infra:render-wrangler
npm run jwt:setup-secrets
npm run infra:provision
npm run db:migrate:remote
npm run db:set-site-url:remote
npm run db:create-admin:remote
```

---

## Step 5 — Deploy

```bash
# From the monorepo root:
npm run deploy
```

This deploys `argon-hasher` first (required), then `apps/auth`.

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

### Branding

- **Site logo** — Upload via admin dashboard → Settings → Site Logo
- **Worker name** — Change `name` in `apps/auth/wrangler.jsonc`
- **Client ID prefix** — Change `CLIENT_KEY_PREFIX` var in `wrangler.jsonc` (e.g. `myapp`)

### Email

The server uses [Resend](https://resend.com) for transactional email. Templates are defined in `apps/auth/src/lib/email/`. You can customize the HTML/text content there.

### Scopes

Default scopes are seeded during `db:bootstrap`. Add custom scopes in the admin dashboard → Scopes or by modifying the bootstrap script.

### Password Hashing

The default is `argon` (Argon2id via the `argon-hasher` worker). To use an alternative method, set `HASH_METHOD` in `wrangler.jsonc` and implement the hash interface in `apps/auth/src/lib/auth/`.

---

## What Is NOT Committed (Template Boundaries)

These files contain instance-specific values and are **gitignored** — you generate them locally:

| File | Description |
|---|---|
| `apps/auth/wrangler.generated.jsonc` | Generated from Terraform with real D1/R2 IDs |
| `apps/auth/infra/out/terraform.tf.json` | Terraform output JSON |
| `apps/auth/infra/terraform/terraform.tfvars` | Your account ID and resource names |
| `apps/auth/.env.local` | Local env vars |
| `apps/auth/.dev.vars` | Wrangler local dev secrets |

The committed `apps/auth/wrangler.jsonc` is the **template** — it contains placeholders (`REPLACE_WITH_YOUR_*`) and is the file that gets rendered into `wrangler.generated.jsonc` by the infra scripts.

---

## Updating the Template

To pull in upstream changes after you've deployed your instance:

```bash
git remote add upstream https://github.com/eetr-ai/eetr-auth.git
git fetch upstream
git merge upstream/main
```

Check for any new database migrations in `apps/auth/db/migration-*.sql` and apply them:

```bash
cd apps/auth
npm run db:migrate:remote
```
