# D1 schema

As of version `0.1.0`, the auth app assumes a clean-slate D1 database.

- **`schema.sql`** – The complete authoritative schema for the auth database.

Apply `schema.sql` to create a fresh local or remote D1 database. Legacy incremental migration files are no longer maintained in this repo.

## Apply schema

From the project root:

- **Local D1** (dev):  
  `npm run db:migrate`
- **Remote D1** (Cloudflare):  
  `npm run db:migrate:remote`
- **Both**:  
  `npm run db:bootstrap`

Requires the D1 database to exist. Default name is `eetr-auth`; override with **`D1_DATABASE_NAME`** for Terraform-created databases. For a new remote DB, use [infra/INSTALL.md](../infra/INSTALL.md) (Terraform + `wrangler.generated.jsonc`) or create it in the dashboard and set `database_id` in `wrangler.jsonc`.

For login (Auth.js), set `AUTH_SECRET` in `.env.local` (dev) or via `wrangler secret put AUTH_SECRET` (production). See `.env.example`.

## Create an admin user

From the project root, create an admin (`users.is_admin = 1`) in **both** local and remote D1 using `username` + `email`.
The script stores a random placeholder password hash; finish setup via password reset.

```bash
npm run db:create-admin -- <username> <email>
```

Alias:

```bash
npm run db:create-user -- <username> <email>
```

Or use env vars:

```bash
ADMIN_USERNAME=admin ADMIN_EMAIL=admin@example.com npm run db:create-admin
```

- **Local only:** `npm run db:create-admin:local -- <username> <email>`
- **Remote only:** `npm run db:create-admin:remote -- --config wrangler.generated.jsonc <username> <email>`
