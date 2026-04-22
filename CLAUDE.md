# Agent notes

Read these before touching the codebase.

## UI work

Follow [docs/UX_GUIDELINES.md](docs/UX_GUIDELINES.md) for any change in [apps/auth/src/app/](apps/auth/src/app/). It covers destructive-action confirmations (inline, never `window.confirm`), button/banner/card conventions, icon vocabulary, and color tokens.

## Architecture, features, deployment

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system overview, service/repository layers, Cloudflare bindings.
- [docs/FEATURES.md](docs/FEATURES.md) — OAuth/OIDC grants, user auth, passkeys, admin surface.
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — remote/local setup, Wrangler config, secrets.

## Database

[apps/auth/db/README.md](apps/auth/db/README.md) is authoritative on schema patches. `schema.sql` is the fresh-install snapshot; `db/patches/<version>.sql` is the delta from the previous release. Every schema change updates both and bumps `schema_metadata.schema_version`.
