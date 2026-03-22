# D1 schema and migrations

- **`schema.sql`** – Full schema for the auth DB (environments, users, clients, redirect_uris, scopes, client_scopes, tokens, token_scopes, token_activity_log).
- **`migration-20260303-rename-admins-to-users.sql`** – One-time migration for existing databases (`admins` -> `users`, add `is_admin`, and update `clients.created_by` FK).
- **`migration-20260303-token-activity-log.sql`** – Adds `token_activity_log` table (optional if you already apply full `schema.sql`; use if your DB was created before this table was in schema).
- **`migration-20260304-clients-name.sql`** – Adds optional `name` column to `clients` for human-readable labels (run on existing DBs that don’t have it; fresh schema already includes it).

## Apply schema

From the project root:

- **Local D1** (dev):  
  `npm run db:migrate`
- **Remote D1** (Cloudflare):  
  `npm run db:migrate:remote`
- **Both**:  
  `npm run db:bootstrap`

Requires the D1 database to exist. Default name is `progression-ai-auth`; override with **`D1_DATABASE_NAME`** for Terraform-created databases. For a new remote DB, use [infra/INSTALL.md](../infra/INSTALL.md) (Terraform + `wrangler.generated.jsonc`) or create it in the dashboard and set `database_id` in `wrangler.jsonc`.

For login (Auth.js), set `AUTH_SECRET` in `.env.local` (dev) or via `wrangler secret put AUTH_SECRET` (production). See `.env.example`.

## One-time migration for existing DBs

If your database already has the `admins` table, run this migration once before applying app code changes:

- **Local D1** (dev):  
  `wrangler d1 execute progression-ai-auth --local --file=./db/migration-20260303-rename-admins-to-users.sql`
- **Remote D1** (Cloudflare):  
  `wrangler d1 execute progression-ai-auth --remote --file=./db/migration-20260303-rename-admins-to-users.sql`

If the migration fails with `there is already another table or index with this name: users`, your DB is in a mixed state (`users` already created but `admins` still present). Run the repair migration instead:

- **Local D1** (dev):  
  `wrangler d1 execute progression-ai-auth --local --file=./db/migration-20260303-repair-admins-users-split.sql`
- **Remote D1** (Cloudflare):  
  `wrangler d1 execute progression-ai-auth --remote --file=./db/migration-20260303-repair-admins-users-split.sql`

## Create an admin user

From the project root, create an admin (`users.is_admin = 1`) in **both** local and remote D1 (password is MD5-hashed, same as login):

```bash
npm run db:create-admin -- <username> <password>
```

Alias:

```bash
npm run db:create-user -- <username> <password>
```

Or use env vars (e.g. to avoid putting the password in shell history):

```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD=yourpassword npm run db:create-admin
```

- **Local only:** `npm run db:create-admin:local -- <username> <password>`
- **Remote only:** `npm run db:create-admin:remote -- <username> <password>`
