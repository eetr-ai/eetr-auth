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
