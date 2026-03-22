# Greenfield installation (new Cloudflare environment)

End-to-end steps to provision D1 + R2 with Terraform, render Wrangler config, upload secrets and JWKS, migrate the database, deploy OpenNext, and create an admin.

## Prerequisites

- **Node.js** and npm (see repo `package.json`).
- **Terraform** `>= 1.5` ([install](https://developer.hashicorp.com/terraform/install)).
- A **Cloudflare** account with Workers, D1, and R2. See [terraform/README.md](./terraform/README.md) for API token permissions.
- **`CLOUDFLARE_API_TOKEN`** exported (or `wrangler login`) for Terraform and Wrangler.
- **Argon hasher** Worker deployed in the same account, bound as in `wrangler.jsonc` (`service: "argon-hasher"`). Required when `HASH_METHOD` is `argon` (default in `wrangler.jsonc` `vars`).
- Optional: **Resend** API key if you use transactional email (`resend_api_key` in tfvars or `RESEND_API_KEY` when provisioning).

## 1. Clone and install

```bash
git clone <repo-url>
cd progression-ai-auth
npm install
```

## 2. Terraform

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

## 3. Terraform outputs for scripts

From the **repository root**:

```bash
npm run infra:terraform-output
```

This writes `infra/out/terraform.tf.json` (gitignored).

## 4. Render Wrangler config

```bash
npm run infra:render-wrangler
```

Writes `wrangler.generated.jsonc` (gitignored) with D1 id, R2 bucket, worker `name` + `WORKER_SELF_REFERENCE`, and `vars` URLs from Terraform.

Optional overrides (instead of editing tfvars):

```bash
node scripts/render-wrangler-config.mjs \
  --tf-json infra/out/terraform.tf.json \
  --issuer-base-url https://... \
  --auth-url https://.../api/auth/session \
  --jwks-cdn-base-url https://...
```

## 5. Provision Worker secrets and JWKS

Uses `wrangler.generated.jsonc` by default (`WRANGLER_CONFIG` overrides).

```bash
npm run infra:provision
```

This uploads `AUTH_SECRET`, `HMAC_KEY`, `JWT_PRIVATE_KEY`, optional `RESEND_API_KEY`, and puts `jwks.json` into the R2 bucket from Terraform output.

## 6. Apply database schema (remote D1)

Align `D1_DATABASE_NAME` with `d1_database_name` from Terraform (defaults to `progression-ai-auth` if unset):

```bash
export D1_DATABASE_NAME=your-d1-name-from-tfvars
npm run db:migrate:remote
```

## 7. Deploy OpenNext

```bash
npm run deploy:infra
```

Uses `wrangler.generated.jsonc` (`opennextjs-cloudflare deploy -c wrangler.generated.jsonc`).

## 8. DNS and JWKS CDN

- Route your auth hostname to the Worker; `ISSUER_BASE_URL` and `AUTH_URL` must match what users use.
- Expose `jwks.json` at `JWKS_CDN_BASE_URL` (e.g. R2 custom domain or CDN) so `jwks_uri` in OIDC metadata resolves.

## 9. Create first admin

For `HASH_METHOD=argon`, set `ARGON_HASHER_HASH_URL` or `ARGON_HASHER_URL` to your hasher’s `/hash` endpoint (same binding as production). Then:

```bash
export D1_DATABASE_NAME=your-d1-name
export HASH_METHOD=argon
export ARGON_HASHER_URL=https://...   # or ARGON_HASHER_HASH_URL
npm run db:create-admin:remote -- <username> <password>
```

## 10. Smoke test

- `GET /api/health`
- Sign in and exercise OAuth/token flows as needed.

## 11. Ongoing

Re-running `npm run infra:provision` **regenerates** `AUTH_SECRET`, `HMAC_KEY`, and JWT keys—only do this when rotating credentials. Re-running `infra:render-wrangler` is safe when Terraform outputs change.

## Order summary

`terraform apply` → `infra:terraform-output` → `infra:render-wrangler` → `infra:provision` → `db:migrate:remote` → `deploy:infra` → DNS / JWKS CDN → `db:create-admin:remote` → verify.
