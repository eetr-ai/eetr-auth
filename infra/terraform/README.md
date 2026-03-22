# Cloudflare D1 + R2 (Terraform)

Terraform provisions a **D1 database** and **R2 bucket** for this app. Other values (`worker_name`, public URLs, optional Resend key) are **passthrough** variables echoed as outputs so `scripts/render-wrangler-config.mjs` and `scripts/provision-env.mjs` can drive Wrangler without duplicating config.

## Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/install) `>= 1.5`
- Terraform Cloudflare provider `~> 4.40` (declared in `versions.tf`)

## API token

Create a Cloudflare **API Token** with at least:

- **Account** → **D1** → Edit
- **Account** → **Workers R2 Storage** → Edit (or equivalent for R2 bucket management)
- **Account** → **Account Settings** → Read (if you need account metadata)

Set `CLOUDFLARE_API_TOKEN` in the environment before `terraform plan` / `apply`, or configure the provider via your preferred method.

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
