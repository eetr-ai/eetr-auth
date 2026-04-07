# Cloudflare D1 + R2 (Terraform)

Terraform provisions a **D1 database** and **R2 bucket** for this app. Other values (`worker_name`, public URLs, optional Resend key) are **passthrough** variables echoed as outputs so `scripts/render-wrangler-config.mjs` and `scripts/provision-env.mjs` can drive Wrangler without duplicating config.

## Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/install) `>= 1.5`
- Terraform Cloudflare provider `~> 4.40` (declared in `versions.tf`)

## API token

Terraform only accepts a Cloudflare **API Token** (or legacy global key—avoid). Set `CLOUDFLARE_API_TOKEN` before `terraform plan` / `apply`.

**Minimum permissions for Terraform in this repo:**

- **Account** → **D1** → Edit
- **Account** → **Workers R2 Storage** → Edit (R2 buckets)
- **Account** → **Account Settings** → Read (optional; account metadata)

**If you use the same token for Wrangler** (`npm run infra:provision`, `wrangler secret put`, deploy), add:

- **Account** → **Workers Scripts** → **Edit** (required to create/update Worker **secrets**; without this, `wrangler secret put` fails with authentication error `10000`.)

Scope the token to the correct **Account** (your account ID in `terraform.tfvars`).

### Wrangler: OAuth instead of a token

Wrangler reads **`CLOUDFLARE_API_TOKEN` first**. If that variable is set but the token lacks **Workers Scripts → Edit**, secret upload will fail.

**Option A — Logged-in user (no API token for Wrangler):** run `npx wrangler login`, then **unset** the variable for the shell where you provision/deploy:

```bash
unset CLOUDFLARE_API_TOKEN
npm run infra:provision
```

Use a **separate terminal** (or export the token only when running Terraform) so Terraform still has `CLOUDFLARE_API_TOKEN` while Wrangler uses OAuth.

**Option B — One token for everything:** include **Workers Scripts → Edit** plus the Terraform permissions above, and keep `CLOUDFLARE_API_TOKEN` set.

Do **not** commit `terraform.tfvars` if it contains `resend_api_key` or other secrets.

## Usage

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with account_id, names, URLs, etc.

terraform init
terraform plan
terraform apply
```

Write outputs for the Node scripts (path is gitignored):

```bash
terraform output -json > ../out/terraform.tf.json
```

Then from the repo root: `npm run infra:render-wrangler` and `npm run infra:provision` (see [../INSTALL.md](../INSTALL.md)).
