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

## Clean Install

Use this path for a brand-new Cloudflare environment.

The operator inputs are:

1. export `CLOUDFLARE_API_TOKEN`
2. fill Terraform variables
3. run Terraform apply
4. deploy `argon-hasher`

After that, the repo automates the rest.

### 1. Verify Cloudflare CLI access

```bash
npx wrangler whoami
```

The prescribed install path uses the exported `CLOUDFLARE_API_TOKEN`; `wrangler login` is not required.

### 2. Install prerequisites

```bash
rustup target add wasm32-unknown-unknown
cargo install worker-build --version '^0.7'
npm install
```

### 3. Configure Terraform variables

```bash
cd apps/auth
cp infra/terraform/terraform.tfvars.example infra/terraform/terraform.tfvars
```

Edit `infra/terraform/terraform.tfvars`:

```hcl
account_id        = "YOUR_CLOUDFLARE_ACCOUNT_ID"
d1_database_name  = "eetr-auth"
r2_bucket_name    = "eetr-auth-assets"
worker_name       = "eetr-auth"
issuer_base_url   = "https://auth.yourdomain.com"
auth_url          = "https://auth.yourdomain.com/api/auth/session"
jwks_cdn_base_url = "https://cdn.yourdomain.com"
resend_api_key    = "re_XXXXXXXXXXXX"   # optional
```

`auth_url` must be the full Auth.js session endpoint.

### 4. Provision D1 + R2 via Terraform

```bash
cd apps/auth/infra/terraform
terraform init
terraform apply
```

### 5. Deploy `argon-hasher`

From the repository root:

```bash
npm run deploy:argon-hasher
```

### 6. Run automated remote setup

From the repository root:

```bash
npm run setup:remote
```

This command now automates the post-Terraform setup:

- exports Terraform outputs
- renders `wrangler.generated.jsonc`
- validates Cloudflare access and remote prerequisites
- provisions missing Wrangler secrets and JWT/JWKS material
- applies the fresh remote schema snapshot
- builds and deploys the auth worker
- seeds the bootstrap remote admin user

Optional flags:

```bash
npm run setup:remote -- --email admin@yourdomain.com
npm run setup:remote -- --force-rotate-secrets
```

### 7. First-login hardening

The clean-install flow seeds a bootstrap admin:

- Username: `admin`
- Password: `admin`
- Default email: `admin@example.com` unless overridden with `--email`

After first login, do one of these immediately:

- create a real admin account, then delete the bootstrap `admin` account
- or change the bootstrap admin password and replace the placeholder email with a real admin email address

Do not leave the bootstrap password or placeholder email in place.

### 8. DNS and JWKS CDN

- Route your auth hostname to the Worker; `ISSUER_BASE_URL` and `AUTH_URL` must match what users use.
- Expose `jwks.json` at `JWKS_CDN_BASE_URL` so `jwks_uri` in OIDC metadata resolves.

### 9. Smoke test

```bash
curl https://auth.yourdomain.com/api/health
```

Expected response:

```json
{ "status": "ok" }
```

## Upgrade Existing Deployment

Use this path when the environment already exists and you want to preserve current secrets by default.

From the repository root:

```bash
npm run upgrade:remote
```

This command now automates the upgrade flow:

- exports Terraform outputs
- renders `wrangler.generated.jsonc`
- validates upgrade prerequisites
- provisions only missing secrets by default
- applies versioned remote D1 patches via `db:migrate:remote`
- builds and deploys the auth worker

Optional flag:

```bash
npm run upgrade:remote -- --force-rotate-secrets
```

Use `--force-rotate-secrets` only when intentionally rotating credentials.

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

## Ongoing

`npm run infra:prepare-config` is safe to rerun when Terraform outputs change.

`npm run infra:provision` now preserves existing secrets by default. Use explicit force-rotation when intentionally replacing `AUTH_SECRET`, `HMAC_KEY`, or JWT signing material.

---

## Environment Variables Reference

### Wrangler `vars` (non-secret)

| Variable | Description |
|---|---|
| `AUTH_URL` | Full URL to the auth worker (e.g. `https://auth.yourdomain.com`) |
| `ISSUER_BASE_URL` | OAuth issuer base URL (usually same as `AUTH_URL`) |
| `JWKS_CDN_BASE_URL` | Base URL for the public JWKS endpoint (can be R2 public URL) |
| `EMAIL_FROM_ADDRESS` | Optional transactional email sender address used for password reset and other email flows. Set this in Wrangler `vars`; if unset, the app falls back to `no-reply@<site hostname>`. |
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
- Re-run `npm run infra:provision -- --force-rotate` only when intentionally rotating keys
