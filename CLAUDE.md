# Agent notes

Read these before touching the codebase.

## UI work

Follow [docs/UX_GUIDELINES.md](docs/UX_GUIDELINES.md) for any change in [apps/auth/src/app/](apps/auth/src/app/). It covers destructive-action confirmations (inline, never `window.confirm`), button/banner/card conventions, icon vocabulary, and color tokens.

## Architecture, features, deployment

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system overview, service/repository layers, Cloudflare bindings, and the **Layer conventions** every contributor follows (server actions → `onServerAction`/services only, services hold business logic, repositories persist only, plus the `worker.ts` OpenNext-entry rule).
- [docs/FEATURES.md](docs/FEATURES.md) — OAuth/OIDC grants, user auth, passkeys, admin surface.
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — remote/local setup, Wrangler config, secrets.

## Database

[db/README.md](db/README.md) is authoritative on schema patches. `schema.sql` is the fresh-install snapshot; `db/patches/<version>.sql` is the delta from the previous release. Every schema change updates both and bumps `schema_metadata.schema_version`.

## Keeping guidance current

When the user establishes a new design decision, convention, or process requirement, persist it in the canonical docs above rather than letting it live only in chat — update the closest existing section instead of creating a parallel copy:

- Layering / coding rules → [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (Layer conventions).
- UI / component / theming rules → [docs/UX_GUIDELINES.md](docs/UX_GUIDELINES.md).
- Feature behavior and config → [docs/FEATURES.md](docs/FEATURES.md) / [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
- Schema rules → [db/README.md](db/README.md).

These docs are the single source of truth for all agents — keep guidance here, not in tool-specific config files.
