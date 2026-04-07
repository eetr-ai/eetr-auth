# Remote setup

Use one of two paths:

- **Clean install** for a brand-new Cloudflare environment
- **Upgrade existing environment** for an already-deployed auth worker/D1 setup

## Prerequisites

- **Node.js** and npm (see repo `package.json`).
- **Terraform** `>= 1.5` ([install](https://developer.hashicorp.com/terraform/install)).
- A **Cloudflare** account with Workers, D1, and R2. See [terraform/README.md](./terraform/README.md) for API token permissions.
- **Auth:** Use one Cloudflare API token (`CLOUDFLARE_API_TOKEN`) for the full install flow. It must include D1, R2, Account Settings, and Workers Scripts permissions so Terraform, `infra:provision`, and Wrangler deploy commands all succeed without switching auth modes.
- **Argon hasher** Worker deployed in the same account, bound as in `infra/wrangler.template.jsonc` and the rendered `wrangler.generated.jsonc` (`service: "argon-hasher"`). Required when `HASH_METHOD` is `argon`.
- Optional: **Resend** API key if you use transactional email (`resend_api_key` in tfvars or `RESEND_API_KEY` when provisioning).

## Clean install

The operator inputs for a clean install are:

- export `CLOUDFLARE_API_TOKEN`
- fill Terraform variables
- run Terraform apply
- deploy `argon-hasher`

After that, the repo should automate the rest.

### 1. Clone and install

```bash
git clone <repo-url>
cd eetr-auth
npm install
```

### 2. Terraform

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars: account_id, d1_database_name, r2_bucket_name, worker_name,
# issuer_base_url, auth_url, jwks_cdn_base_url, optional resend_api_key, optional r2_location

terraform init
terraform apply
cd ../..
```

`auth_url` must be the full Auth.js session URL, e.g. `https://auth.example.com/api/auth/session`.

### 3. Deploy `argon-hasher`

Deploy the Worker service binding target before the auth app:

```bash
npm run deploy:argon-hasher
```

### 4. Run the automated remote setup

From the repository root:

```bash
npm run setup:remote
```

This command now automates the post-Terraform flow:

- exports Terraform outputs
- renders `wrangler.generated.jsonc`
- validates Cloudflare access and remote setup prerequisites
- provisions missing Wrangler secrets and JWT/JWKS material
- applies the fresh remote schema snapshot
- builds and deploys the auth worker
- seeds the bootstrap remote admin user

Optional flags:

```bash
npm run setup:remote -- --email admin@yourdomain.com
npm run setup:remote -- --force-rotate-secrets
```

`wrangler.generated.jsonc` is still the default rendered config. Re-running config preparation remains safe and preserves non-managed Wrangler vars.

Optional email sender override:

- Set `EMAIL_FROM_ADDRESS` in `wrangler.generated.jsonc` under `vars` (for example `no-reply@auth.example.com`).
- Use a sender address that is valid for your Resend configuration.
- If unset, the app falls back to `no-reply@<site hostname>`.

Optional overrides (instead of editing tfvars):

```bash
node scripts/render-wrangler-config.mjs \
  --tf-json infra/out/terraform.tf.json \
  --issuer-base-url https://... \
  --auth-url https://.../api/auth/session \
  --jwks-cdn-base-url https://...
```

### 5. First login hardening

The clean-install flow seeds a bootstrap admin:

- Username: `admin`
- Password: `admin`
- Default email: `admin@example.com` unless overridden with `--email`

After the first successful login, do one of these immediately:

- create a real admin account, then delete the bootstrap `admin` account
- or change the bootstrap admin password and replace the placeholder email with a real admin email address

Do not leave the bootstrap password or placeholder email in place.

### 6. DNS and JWKS CDN

- Route your auth hostname to the Worker; `ISSUER_BASE_URL` and `AUTH_URL` must match what users use.
- Expose `jwks.json` at `JWKS_CDN_BASE_URL` (e.g. R2 custom domain or CDN) so `jwks_uri` in OIDC metadata resolves.

### 7. Smoke test

- `GET /api/health`
- Sign in and exercise OAuth/token flows as needed.

## Upgrade existing environment

Use this path when the environment already exists and you want to preserve current secrets by default.

From the repository root:

```bash
npm run upgrade:remote
```

This command now automates the upgrade flow:

- exports Terraform outputs
- renders `wrangler.generated.jsonc`
- validates remote upgrade prerequisites
- provisions only missing secrets by default
- applies versioned remote D1 patches via `db:migrate:remote`
- builds and deploys the auth worker

Optional flags:

```bash
npm run upgrade:remote -- --force-rotate-secrets
```

Use `--force-rotate-secrets` only when intentionally rotating credentials.

## Local-only quick setup

If you only need local development setup (no Terraform/deploy), choose the path that matches your local database state.

### 1. Prepare local env files and secrets

```bash
npm run setup:local:env
```

### 2. Choose the local D1 path

For a brand-new local database or a full reset from scratch, bootstrap from the current schema snapshot:

```bash
npm run db:seed-local-admin
npm run db:schema
npm run db:set-site-url:local -- https://auth.example.com
```

For an existing local database from a previous app version, apply versioned patches instead:

```bash
npm run db:migrate
npm run db:set-site-url:local -- https://auth.example.com
```

Or run the one-shot bootstrap command for a clean local environment:

```bash
npm run setup:local
```

The bootstrap path applies `db/schema.sql`, seeds the default local `admin` / `admin` user with an MD5 password hash for development sign-in, and prepares local secrets. Use `npm run db:create-admin:local -- <username> <email>` only when you explicitly need an additional named local admin. Use `npm run db:migrate` only when upgrading an existing local database with versioned patches.

## Ongoing

`npm run infra:prepare-config` is safe to rerun when Terraform outputs change.

`npm run infra:provision` now preserves existing secrets by default. Use explicit force-rotation when you intend to replace `AUTH_SECRET`, `HMAC_KEY`, or JWT signing material.

## Order summary

Clean install:

`terraform apply` → `deploy:argon-hasher` → `setup:remote` → DNS / JWKS CDN → first-login hardening

Upgrade:

`terraform apply` (if infra changed) → `upgrade:remote`
