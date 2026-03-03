# D1 schema and migrations

- **`schema.sql`** – Full schema for the auth DB (environments, admins, clients, redirect_uris, scopes, client_scopes, tokens, token_scopes).

## Apply schema

From the project root:

- **Local D1** (dev):  
  `npm run db:migrate`
- **Remote D1** (Cloudflare):  
  `npm run db:migrate:remote`
- **Both**:  
  `npm run db:bootstrap`

Requires the D1 database `progression-ai-auth` to exist. For a new remote DB, create it in the Cloudflare dashboard and set `database_id` in `wrangler.jsonc`.

For login (Auth.js), set `AUTH_SECRET` in `.env.local` (dev) or via `wrangler secret put AUTH_SECRET` (production). See `.env.example`.

## Create an admin user

From the project root, create an admin in **both** local and remote D1 (password is MD5-hashed, same as login):

```bash
npm run db:create-admin -- <username> <password>
```

Or use env vars (e.g. to avoid putting the password in shell history):

```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD=yourpassword npm run db:create-admin
```

- **Local only:** `npm run db:create-admin:local -- <username> <password>`
- **Remote only:** `npm run db:create-admin:remote -- <username> <password>`
