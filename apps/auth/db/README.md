# D1 schema

As of version `0.1.0`, the auth app uses versioned schema patches.

- **`schema.sql`** – The complete authoritative snapshot of the current schema.
- **`patches/`** – Incremental schema patches named after released schema versions, for example `0.1.0.sql`.

Databases without `schema_metadata` are treated as schema version `0.0.0`.

- For a clean install with no existing application tables, the runner applies `schema.sql` directly.
- For an existing pre-versioned database, the first released patch, `0.1.0.sql`, adds the metadata table and records schema version `0.1.0`.

## Apply schema

From the project root:

- **Local D1** (dev):
  `npm run db:migrate`
- **Remote D1** (Cloudflare):
  `npm run db:migrate:remote`
- **Both**:
  `npm run db:bootstrap`

Requires the D1 database to exist. Default name is `eetr-auth`; override with **`D1_DATABASE_NAME`** for Terraform-created databases. For a new remote DB, use [infra/INSTALL.md](../infra/INSTALL.md) (Terraform + `wrangler.generated.jsonc`) or create it in the dashboard and set `database_id` in a generated Wrangler config.

For login (Auth.js), set `AUTH_SECRET` in `.env.local` (dev) or via `wrangler secret put AUTH_SECRET` (production). See `.env.example`.

## Migration strategy

`db:migrate` and `db:migrate:remote` now do the following:

1. Read `schema_metadata.schema_version`.
2. If the metadata table does not exist, assume version `0.0.0`.
3. If the database has no application tables yet, apply `schema.sql` as the clean-install snapshot.
4. Otherwise, apply every patch in `db/patches` with a version greater than the current version, in ascending semver order.
5. Each patch is responsible for updating `schema_metadata.schema_version` to its own version at the end.

For a brand-new database, the runner uses `schema.sql`. For an existing pre-metadata database, the runner starts with `db/patches/0.1.0.sql`.

Patch files are release-versioned, not change-by-change migration files. During development, schema changes for the next database release accumulate into the next unreleased patch file. When that schema is released, the patch version should match the released schema version.

Not every app release needs a database patch. If a release does not change the schema, no new file is added under `db/patches`, and the database schema version simply stays on the latest released schema version.

## Authoring the next schema release

When the schema changes in a future release:

1. Update `schema.sql` so it matches the new latest schema.
2. Add or continue updating the unreleased patch file in `db/patches`, named with the target schema release version.
3. Make the patch idempotent enough for the expected upgrade path.
4. End the patch by updating `schema_metadata.schema_version` to the released version.

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
