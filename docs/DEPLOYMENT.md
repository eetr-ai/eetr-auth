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
export CLOUDFLARE_ACCOUNT_ID=your_account_id   # same value as account_id in terraform.tfvars
```

Required permissions for the install flow in this repo:

- `Account -> D1 -> Edit`
- `Account -> Workers R2 Storage -> Edit`
- `Account -> Account Settings -> Read`
- `Account -> Workers Scripts -> Edit`

Best practice for this repo: use one properly scoped API token for the entire install and deploy flow. Keep `CLOUDFLARE_API_TOKEN` exported for Terraform, `infra:provision`, and Wrangler deploy commands.

**Export `CLOUDFLARE_ACCOUNT_ID` too** if your token can access more than one Cloudflare account. Wrangler does not read `terraform.tfvars`, so without it Wrangler picks a default account and may deploy to the wrong one — surfacing as an `Authentication error [code: 10000]` whose URL contains an account id that is *not* your `terraform.tfvars` `account_id`. The rendered `wrangler.generated.jsonc` pins `account_id` for the auth Worker automatically, but the `argon-hasher` Worker is deployed straight from its `wrangler.toml`, so it relies on this variable. If you hit a `10000`, first check the account id in the error URL matches your target account before adjusting token scopes.

---

## Clean Install

Use this path for a brand-new Cloudflare environment. It is the authoritative, step-by-step fresh-install
guide for this repo.

The only manual operator inputs are:

1. export `CLOUDFLARE_API_TOKEN` (see [Cloudflare Preflight](#cloudflare-preflight) above)
2. fill Terraform variables
3. run `terraform apply`
4. deploy `argon-hasher`

After that, `npm run setup:remote` automates the rest (config rendering, secrets, schema, deploy, admin seed).

All commands below are run **from the repository root** unless a step explicitly says otherwise. The `npm run`
scripts delegate into `apps/auth` via the npm workspace, so you do not need to `cd apps/auth` to run them.

### 1. Verify Cloudflare CLI access

```bash
npx wrangler whoami
```

This confirms `CLOUDFLARE_API_TOKEN` is exported and valid, and prints your `account_id`. The prescribed
install path uses the exported token; `wrangler login` is not required.

### 2. Install build prerequisites

```bash
rustup target add wasm32-unknown-unknown   # WASM target for the Rust argon-hasher
cargo install worker-build --version '^0.7' # builds the hasher Worker
npm install                                  # installs all workspace dependencies
```

### 3. Configure Terraform variables

```bash
cp infra/terraform/terraform.tfvars.example infra/terraform/terraform.tfvars
```

Edit `infra/terraform/terraform.tfvars`:

```hcl
account_id        = "YOUR_CLOUDFLARE_ACCOUNT_ID"      # from `npx wrangler whoami` or the dashboard
d1_database_name  = "eetr-auth"                        # name for the D1 database Terraform creates
r2_bucket_name    = "eetr-auth-assets"                 # R2 bucket for avatars, site logo, and jwks.json
worker_name       = "eetr-auth"                        # the auth Worker's name (also its service-binding name)
issuer_base_url   = "https://auth.yourdomain.com"      # OAuth/OIDC issuer; the public auth hostname
auth_url          = "https://auth.yourdomain.com/api/auth/session"  # FULL Auth.js session endpoint, not just the host
jwks_cdn_base_url = "https://cdn.yourdomain.com"       # public base URL that serves jwks.json (often an R2 custom domain)
resend_api_key    = "re_XXXXXXXXXXXX"                  # optional — only needed for transactional email (password reset, OTP)
```

Notes:

- `auth_url` must be the **full** Auth.js session endpoint (ends in `/api/auth/session`), not just the host.
- `account_id` is the same value `npx wrangler whoami` printed in step 1.
- `resend_api_key` is optional; leave it out if you are not sending email yet.
- R2 must already be activated once on the account (see the [Cloudflare Preflight](#cloudflare-preflight)
  section) — Terraform cannot create the bucket otherwise.

### 4. Provision D1 + R2 via Terraform

```bash
cd infra/terraform
terraform init
terraform apply
cd -            # return to the repository root for the remaining steps
```

**Checkpoint:** after `terraform apply` succeeds, confirm the D1 database and R2 bucket now exist in the
Cloudflare dashboard (or via `npx wrangler d1 list`).

### 5. Deploy `argon-hasher`

The auth Worker reaches the password hasher through a service binding, so the hasher must exist first.

```bash
npm run deploy:argon-hasher
```

**Checkpoint:** the `argon-hasher` Worker now appears under Workers & Pages in the dashboard.

### 6. Run automated remote setup

```bash
npm run setup:remote
```

This single command performs the entire post-Terraform setup, in order:

- exports Terraform outputs (database id, bucket name, rendered URLs)
- renders `apps/auth/wrangler.generated.jsonc` from the template
- validates Cloudflare access and remote prerequisites
- provisions missing Wrangler secrets and JWT/JWKS material (existing secrets are preserved by default)
- applies the fresh remote schema snapshot (`db/schema.sql`) to the new D1 database
- builds and deploys the auth Worker
- seeds the bootstrap remote admin user

Optional flags:

```bash
npm run setup:remote -- --email admin@yourdomain.com   # set the bootstrap admin email up front
npm run setup:remote -- --force-rotate-secrets          # regenerate AUTH_SECRET/HMAC_KEY/JWT material (rarely needed on a clean install)
```

**Checkpoint:** the command finishes without errors, `apps/auth/wrangler.generated.jsonc` exists, and the
`eetr-auth` Worker is deployed and listed in the dashboard.

### 7. First-login hardening (do this immediately)

> ⚠️ **Security-critical.** The clean-install flow seeds a well-known bootstrap admin. Leaving it in place
> exposes the dashboard with publicly known credentials.

The seeded bootstrap admin is:

- Username: `admin`
- Password: `admin`
- Default email: `admin@example.com` unless overridden with `--email`

After the first successful login, do **one** of these right away:

- create a real admin account, then delete the bootstrap `admin` account, **or**
- change the bootstrap admin password and replace the placeholder email with a real admin email address.

Do not leave the bootstrap password or placeholder email in place.

### 8. DNS and JWKS CDN

- Route your auth hostname to the Worker; `ISSUER_BASE_URL` and `AUTH_URL` must match the hostname users
  actually reach.
- Expose `jwks.json` at `JWKS_CDN_BASE_URL` (e.g. an R2 custom domain or CDN) so `jwks_uri` in the OIDC
  metadata resolves publicly.
- Once the hostname is routed, configure the WAF — see
  [Recommended Cloudflare WAF & Rate Limiting](#recommended-cloudflare-waf--rate-limiting).

### 9. Smoke test

```bash
curl https://auth.yourdomain.com/api/health
```

Expected response:

```json
{ "status": "ok" }
```

Then sign in at your auth hostname and exercise the OAuth/token flows you depend on.

> Schema details (fresh snapshot vs. versioned patches) are documented in
> [../db/README.md](../db/README.md). `setup:remote` applies the fresh snapshot for you.

### 10. Verify configuration

```bash
npm run verify:remote
```

Confirms the deployment has the right settings — most importantly that the **JWT signing key
and the published JWKS are consistent** (so issued tokens verify at `/userinfo` and
`/token/validate`). It checks the deployed discovery document (`scopes_supported` includes
`openid`, `jwks_uri` resolves), that the **R2 source JWKS and the CDN JWKS serve the same
`kid`** (no stale CDN cache), and that the `JWT_PRIVATE_KEY` / `AUTH_SECRET` / `HMAC_KEY`
secrets are set. A non-zero exit means something is inconsistent — fix it before relying on
the deployment.

If `scopes_supported` is missing `openid`, the OIDC scopes aren't seeded yet — apply the
schema/patches with `npm run db:migrate:remote` (see [../db/README.md](../db/README.md)).

To additionally verify a freshly minted token's signature against the published JWKS, pass a
client-credentials client:

```bash
VERIFY_CLIENT_ID=... VERIFY_CLIENT_SECRET=... npm run verify:remote
```

## Recommended Cloudflare WAF & Rate Limiting

Once the Worker is routed to your hostname (step 8), put it behind Cloudflare's WAF as defense-in-depth.
This complements the app's own limits (e.g. `MFA_OTP_MAX_ATTEMPTS`); it does not replace them. Configure
these under **Security → WAF** for the auth zone in the Cloudflare dashboard.

Start with the managed protections, then add the targeted rules below.

- Enable the **Cloudflare Managed Ruleset** (and the **OWASP Core Ruleset**) for the zone.
- Turn on **Bot Fight Mode** (or Super Bot Fight Mode if available).

### Rate-limit the authentication and token endpoints

These are the credential-stuffing, OTP-brute-force, and email-abuse targets. Add **Rate Limiting Rules**
(Security → WAF → Rate limiting rules). Thresholds below are conservative starting points — tune them to
your real traffic.

| Endpoint(s) | Why | Suggested limit (per client IP) |
|---|---|---|
| `POST /api/auth/*` (Auth.js sign-in/session) | Password credential stuffing | ~10 requests / 1 min |
| `POST /api/token` | OAuth token issuance / client-secret brute force | ~30 requests / 1 min |
| `POST /api/authorize`, `/api/authorize/complete` | Authorization-code abuse | ~30 requests / 1 min |
| `POST /api/users/email-verification/request` | Email-send abuse (cost + spam) | ~5 requests / 5 min |
| `POST /api/users/email-verification/verify` | Email OTP brute force | ~10 requests / 5 min |
| `POST /forgot-password`, `POST /reset-password` | Reset-email abuse + token guessing | ~5 requests / 5 min |
| `POST /api/auth/passkey/verify`, `/api/users/passkey/verify` | WebAuthn assertion brute force | ~20 requests / 1 min |

Recommended action when a limit is exceeded: **Managed Challenge** (or **Block** for the email-send
endpoints). Match on the path and `http.request.method eq "POST"` so cached `GET`s are unaffected.

> **Note — password-reset and other server actions.** The forgot/reset flows are Next.js
> **server actions**, which POST to the page route that renders them (`/forgot-password`,
> `/reset-password`), not to a dedicated `/api/...` endpoint. Rate-limit those page paths on
> `POST`. `requestPasswordReset` intentionally returns the same response whether or not the
> address exists; rate limiting is what blunts both reset-email bombing and timing-based
> account enumeration, since there is no per-account app-level throttle on the request itself.

These WAF rules are **defense-in-depth on top of** the app's own controls, not a substitute:
email/MFA OTP codes are attempt-capped (`MFA_OTP_MAX_ATTEMPTS`, default 5) and expire in 10
minutes; password-reset links are single-use and invalidated on any password change; refresh
tokens re-check environment access on every rotation. The WAF adds the per-IP request ceiling
the app deliberately does not implement itself.

### Restrict the admin surface

The admin dashboard and admin API should not be reachable by the general public. Add **WAF custom rules**
that **block** (or require a challenge / Cloudflare Access) for traffic to:

- `/dashboard*` — admin UI
- `/api/admin/*` — admin users API and site-logo upload (`/api/admin/users`, `/api/admin/users/[id]`,
  `/api/admin/site-logo`)

Prefer an **IP allowlist** (your office/VPN egress ranges) or **Cloudflare Access** in front of these paths.
Note the admin API is also bearer-token protected in-app, so this is an additional layer, not the only one.

### Leave these open (do not block or aggressively rate-limit)

- `/.well-known/openid-configuration` and `/.well-known/oauth-authorization-server` — OIDC/OAuth discovery,
  fetched by every relying party; keep public and cacheable.
- The public JWKS at `JWKS_CDN_BASE_URL` (served from R2/CDN, not the Worker) — relying parties fetch it to
  verify tokens.
- `/api/health` — uptime checks.
- `/api/userinfo` and `/api/token/validate` — already require a valid bearer token; light rate limiting is
  fine but do not block.

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

## Teardown / Cleanup

To remove the provisioned infrastructure, run `terraform destroy` from `infra/terraform`. One snag: **Terraform cannot delete a non-empty R2 bucket** — it fails with `failed to delete R2 bucket ... is not empty (10008)`. Empty the bucket first.

The auth server stores a few objects in the bucket: the JWKS (`jwks.json` by default), and any uploaded avatars / site logo. Make sure your shell targets the right account before deleting (`export CLOUDFLARE_ACCOUNT_ID=<account_id from terraform.tfvars>`).

**1. Empty the R2 bucket.**

If it only holds the JWKS (typical for a fresh or partial install), delete that one object — `wrangler` can only delete objects individually (no bulk/empty command):

```bash
cd apps/auth
npx wrangler r2 object delete <r2_bucket_name>/jwks.json --remote
```

If the bucket has more objects (avatars, logo, …), use R2's S3-compatible API. Create an **R2 API token** (Cloudflare dashboard → R2 → Manage R2 API Tokens — this gives an Access Key ID + Secret, separate from `CLOUDFLARE_API_TOKEN`), then bulk-delete:

```bash
AWS_ACCESS_KEY_ID=<r2_access_key> AWS_SECRET_ACCESS_KEY=<r2_secret_key> \
  aws s3 rm s3://<r2_bucket_name> --recursive \
  --endpoint-url https://<account_id>.r2.cloudflarestorage.com
```

(`rclone purge` against the same endpoint works too.) The no-CLI option: empty and delete the bucket from the R2 dashboard.

**2. Destroy the infrastructure.**

```bash
cd infra/terraform && terraform destroy
```

This removes the D1 database and R2 bucket. **`terraform destroy` deletes the D1 database and all its data** — export anything you need first. The Worker scripts themselves (auth, argon-hasher) are deployed by Wrangler, not Terraform; delete them from the dashboard (Workers & Pages) or with `npx wrangler delete --name <worker_name>` if you also want those gone.

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

### 6. Verify the local setup

```bash
npm run verify
```

Confirms the local JWT material, the local R2 `jwks.json` (the `kid` the server signs with),
and the core secrets all line up — catching the case where the local R2 holds a stale key and
locally-issued tokens fail verification. `npm run setup:local:env` seeds the local R2 JWKS, so
a fresh `npm run setup:local` should pass.

---

## Ongoing

`npm run infra:prepare-config` is safe to rerun when Terraform outputs change.

`npm run infra:provision` now preserves existing secrets by default. Use explicit force-rotation when intentionally replacing `AUTH_SECRET`, `HMAC_KEY`, or JWT signing material.

`npm run verify` (local) and `npm run verify:remote` (deployed) re-check that the JWT signing key, the published JWKS, the seeded OIDC scopes, and the required secrets are all consistent. Run `verify:remote` after any key rotation or schema migration.

---

## Environment Variables Reference

### Wrangler `vars` (non-secret)

| Variable | Description |
|---|---|
| `AUTH_URL` | Full Auth.js session endpoint (`https://auth.yourdomain.com/api/auth/session`). This is the session URL, **not** the issuer — see `ISSUER_BASE_URL`. |
| `ISSUER_BASE_URL` | OAuth/OIDC issuer base URL — the public auth host (e.g. `https://auth.yourdomain.com`). |
| `JWKS_CDN_BASE_URL` | Base URL for the public JWKS endpoint (can be R2 public URL) |
| `JWKS_R2_KEY` | R2 key for `jwks.json` (default: `jwks.json`) |
| `JWT_KID` | Key ID for the active JWT signing key. Rendered into `wrangler.generated.jsonc` by `infra:render-wrangler`/`setup:remote`; you do not normally set it by hand. |
| `EMAIL_FROM_ADDRESS` | Optional transactional email sender address used for password reset and other email flows. Set this in Wrangler `vars`; if unset, the app falls back to `no-reply@<site hostname>`. |
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
