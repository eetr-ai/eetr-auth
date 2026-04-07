# Cloudflare D1 + R2 (Terraform)

Terraform provisions a **D1 database** and **R2 bucket** for this app. Other values (`worker_name`, public URLs, optional Resend key) are **passthrough** variables echoed as outputs so `scripts/render-wrangler-config.mjs` and `scripts/provision-env.mjs` can drive Wrangler without duplicating config.

## Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/install) `>= 1.5`
- Terraform Cloudflare provider `~> 4.40` (declared in `versions.tf`)

## API token

Terraform only accepts a Cloudflare **API Token** (or legacy global key—avoid). Set `CLOUDFLARE_API_TOKEN` before `terraform plan` / `apply`.

**Required permissions for the install flow in this repo:**

- **Account** → **D1** → Edit
- **Account** → **Workers R2 Storage** → Edit (R2 buckets)
- **Account** → **Account Settings** → Read (optional; account metadata)
- **Account** → **Workers Scripts** → **Edit** (required to create/update Worker **secrets**; without this, `wrangler secret put` fails with authentication error `10000`.)

Scope the token to the correct **Account** (your account ID in `terraform.tfvars`).

Wrangler reads **`CLOUDFLARE_API_TOKEN` first**. The prescribed path in this repo is to keep that variable set and give the token the full permission set above so Terraform and Wrangler use the same account-scoped token throughout the install flow.

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
