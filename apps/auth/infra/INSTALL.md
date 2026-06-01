# Remote setup

The full, step-by-step deployment guide lives in **[../../../docs/DEPLOYMENT.md](../../../docs/DEPLOYMENT.md)**.
It is the single source of truth for both fresh installs and upgrades — use it for the detailed commands,
Terraform variables, environment-variable reference, and troubleshooting.

This file only summarizes the order of operations so you can see the shape of each path at a glance.

## Order summary

**Clean install** (brand-new Cloudflare environment):

`terraform apply` → `npm run deploy:argon-hasher` → `npm run setup:remote` → DNS / JWKS CDN → first-login hardening

`npm run setup:remote` renders `wrangler.generated.jsonc`, provisions secrets and JWT/JWKS material, applies
the fresh `db/schema.sql` snapshot, deploys the auth Worker, and seeds the bootstrap admin.

**Upgrade** (environment already exists, preserve secrets by default):

`terraform apply` (only if infra changed) → `npm run upgrade:remote`

`npm run upgrade:remote` re-renders config, provisions only missing secrets, applies versioned D1 patches via
`db:migrate:remote`, and redeploys. Pass `-- --force-rotate-secrets` only when intentionally rotating
credentials.

## Local-only setup

For local development without Terraform or a remote deploy, see the **Local Development** section of
[../../../docs/DEPLOYMENT.md](../../../docs/DEPLOYMENT.md) and the local quickstart in
[../README.md](../README.md). The one-shot bootstrap is `npm run setup:local`.

## Ongoing

`npm run infra:prepare-config` is safe to rerun when Terraform outputs change. `npm run infra:provision`
preserves existing secrets by default; force-rotation must be requested explicitly.
