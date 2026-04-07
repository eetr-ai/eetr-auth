# Deployment Guide

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://rustup.rs/) with `wasm32-unknown-unknown` target
- [worker-build](https://crates.io/crates/worker-build) CLI
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) v4+ (`npm install -g wrangler`)
- [Terraform CLI](https://developer.hashicorp.com/terraform/install) v1.5+
- A [Cloudflare account](https://cloudflare.com) with Workers, D1, R2, and Images enabled
- A [Resend](https://resend.com) account for transactional email

## Cloudflare Preflight

Before running Terraform, complete the Cloudflare setup for the target account:

1. Get your Cloudflare `account_id`.
	- Run `npx wrangler whoami`, or
	- Find it in the Cloudflare dashboard for the target account, or
	- Call the Cloudflare Accounts API with a valid API token.
2. Activate R2 in the Cloudflare dashboard for that account. Terraform cannot create the bucket until R2 has been enabled once.
3. Create one Cloudflare API token for both Terraform and Wrangler, then export it in the shell where you run the install commands:

```bash
export CLOUDFLARE_API_TOKEN=your_token_here
```

Required permissions for the install flow in this repo:

- `Account -> D1 -> Edit`
- `Account -> Workers R2 Storage -> Edit`
- `Account -> Account Settings -> Read`
- `Account -> Workers Scripts -> Edit`

Best practice for this repo: use one properly scoped API token for the entire install and deploy flow. Keep `CLOUDFLARE_API_TOKEN` exported for Terraform, `infra:provision`, and Wrangler deploy commands.

---

## First-Time Setup

### 1. Verify Cloudflare CLI access

```bash
npx wrangler whoami
```

The prescribed install path uses the exported `CLOUDFLARE_API_TOKEN`; `wrangler login` is not required.

### 2. Install Rust WASM target

```bash
rustup target add wasm32-unknown-unknown
cargo install worker-build --version '^0.7'
```

### 3. Install npm dependencies

```bash
npm install
```

---

## Deploy argon-hasher

> This step must always run before deploying `apps/auth`.

```bash
npm run deploy:argon-hasher
```

Or manually:

```bash
cd apps/argon-hasher
npx wrangler deploy
```

This compiles Rust → WebAssembly and deploys it as a Cloudflare Worker named `argon-hasher`.

---

## Provision Infrastructure (First Time)

All infrastructure commands run from inside `apps/auth/`.

### 1. Configure Terraform variables

```bash
cd apps/auth
cp infra/terraform/terraform.tfvars.example infra/terraform/terraform.tfvars
```

Edit `infra/terraform/terraform.tfvars`:

```hcl
account_id       = "YOUR_CLOUDFLARE_ACCOUNT_ID"
d1_database_name = "eetr-auth"
r2_bucket_name   = "eetr-auth-assets"
worker_name      = "eetr-auth"
issuer_base_url   = "https://auth.yourdomain.com"
auth_url          = "https://auth.yourdomain.com/api/auth/session"
jwks_cdn_base_url = "https://cdn.yourdomain.com"
resend_api_key   = "re_XXXXXXXXXXXX"   # optional
```

`auth_url` must be the full Auth.js session endpoint.

### 2. Provision D1 + R2 via Terraform

```bash
cd apps/auth/infra/terraform
terraform init
terraform apply
```

### 3. Export Terraform outputs

```bash
cd apps/auth
npm run infra:terraform-output
```

This writes `infra/out/terraform.tf.json`.

### 4. Render the deployment wrangler config

```bash
npm run infra:render-wrangler
```

This generates `wrangler.generated.jsonc` with your real D1 database ID and R2 bucket name.

### 5. Keep the shared Cloudflare token exported for Wrangler-backed steps

`infra:provision` and Wrangler deploy commands use the same `CLOUDFLARE_API_TOKEN` you exported during Cloudflare preflight.

### 6. Upload secrets and JWKS to Cloudflare

```bash
npm run infra:provision
```

This uploads `AUTH_SECRET`, `HMAC_KEY`, `JWT_PRIVATE_KEY`, optional `RESEND_API_KEY`, and pushes `jwks.json` to the Terraform-created R2 bucket using `wrangler.generated.jsonc`.

### 7. Generate the local development certificate

```bash
npm run jwt:generate-local-cert
```

### 8. Apply the schema to the new remote database

```bash
npm run db:schema:remote
```

For a fresh installation, apply `db/schema.sql` directly.

Use `npm run db:migrate:remote` later when upgrading an existing deployment with versioned patches.

Remote schema commands assume `wrangler.generated.jsonc` for the Terraform-based install path.

### 9. Set the site URL

```bash
npm run db:set-site-url:remote -- https://auth.yourdomain.com
```

### 10. Create an admin user

```bash
npm run db:create-admin:remote -- <username> <email>
```

---

## Deploy auth

```bash
npm run deploy:auth
```

Or to deploy everything in the correct order from the root:

```bash
npm run deploy
```

> `npm run deploy` runs `deploy:argon-hasher` first, then `deploy:auth`. Always use this for fresh deployments.

---

## Local Development

### 1. Set up local environment variables

```bash
cd apps/auth
cp .env.example .env.local
cp .dev.vars.example .dev.vars
```

Fill in `.env.local` and `.dev.vars` with your local values.

### 2. Generate local JWT certificate

```bash
npm run jwt:generate-local-cert
```

### 3. Run local D1 migrations

```bash
npm run db:migrate
```

### 4. Create a local admin user

```bash
npm run db:create-admin:local
```

### 5. Start the dev server

```bash
npm run dev --workspace=apps/auth
```

The auth server will be available at `http://localhost:3000`.

> For passkey testing, you may need HTTPS. Use a tunneling tool (e.g., Cloudflare Tunnel) to expose your local server with a valid TLS certificate.

---

## Updating an Existing Deployment

### Schema migrations

```bash
cd apps/auth
npm run db:migrate:remote
```

### Redeploy workers

```bash
# From repo root:
npm run deploy:argon-hasher  # only if argon-hasher changed
npm run deploy:auth
```

### Rotate JWT keys

Generate new keys and re-provision:

```bash
cd apps/auth
npm run infra:provision
```

---

## Environment Variables Reference

### Wrangler `vars` (non-secret)

| Variable | Description |
|---|---|
| `AUTH_URL` | Full URL to the auth worker (e.g. `https://auth.yourdomain.com`) |
| `ISSUER_BASE_URL` | OAuth issuer base URL (usually same as `AUTH_URL`) |
| `JWKS_CDN_BASE_URL` | Base URL for the public JWKS endpoint (can be R2 public URL) |
| `JWKS_R2_KEY` | R2 key for `jwks.json` (default: `jwks.json`) |
| `CLIENT_KEY_PREFIX` | Prefix for generated OAuth client IDs (e.g. `eetr`) |
| `HASH_METHOD` | Password hashing method: `argon` (default) or legacy fallback |
| `MFA_OTP_MAX_ATTEMPTS` | Max failed OTP attempts before challenge is invalidated (default: `5`) |

### Wrangler secrets (set via `wrangler secret put` or `infra:provision`)

| Secret | Description |
|---|---|
| `AUTH_SECRET` | NextAuth.js session encryption secret (random 32+ byte string) |
| `HMAC_KEY` | HMAC-SHA256 signing key for internal request validation |
| `JWT_PRIVATE_KEY` | RS256 private key PEM for signing access/ID tokens |
| `RESEND_API_KEY` | Resend API key for transactional email |

---

## Cloudflare Dashboard Verification

After deployment, verify in the [Cloudflare Dashboard](https://dash.cloudflare.com):

1. **Workers & Pages** — both `argon-hasher` and `eetr-auth` workers are listed
2. **D1** — your database exists and tables are created
3. **R2** — your bucket exists and `jwks.json` is present
4. **Workers → eetr-auth → Service Bindings** — `ARGON_HASHER` binding points to `argon-hasher`

---

## Health Check

```bash
curl https://auth.yourdomain.com/api/health
```

Expected response:

```json
{ "status": "ok" }
```

---

## Troubleshooting

**`argon-hasher` deploy fails with WASM error**
- Ensure `wasm32-unknown-unknown` target is installed: `rustup target add wasm32-unknown-unknown`
- Ensure `worker-build` is installed: `cargo install worker-build --version '^0.7'`

**Auth worker fails with "Service binding not found"**
- Deploy `argon-hasher` first: `npm run deploy:argon-hasher`
- Confirm the binding name in `wrangler.generated.jsonc` is `ARGON_HASHER` and service is `argon-hasher`

**D1 migration fails**
- Ensure your `wrangler.generated.jsonc` has the correct `database_id`
- Run `npm run infra:terraform-output && npm run infra:render-wrangler` to regenerate

**JWT verification fails**
- Confirm `jwks.json` is in R2 and `JWKS_CDN_BASE_URL` points to the correct public URL
- Re-run `npm run infra:provision` after rotating keys
