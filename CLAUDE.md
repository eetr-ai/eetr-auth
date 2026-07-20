# Agent notes

Read these before touching the codebase.

The canonical documentation now lives as MDX under [apps/docs/content/docs/](apps/docs/content/docs/) — the Fumadocs site that publishes to GitHub Pages on each release. Treat those files as the single source of truth for agents; the paths below point into them.

## UI work

Follow [apps/docs/content/docs/contributing/ux-guidelines.mdx](apps/docs/content/docs/contributing/ux-guidelines.mdx) for any change in [apps/auth/src/app/](apps/auth/src/app/). It covers destructive-action confirmations (inline, never `window.confirm`), button/banner/card conventions, icon vocabulary, and color tokens.

## Architecture, features, deployment

- [apps/docs/content/docs/architecture/](apps/docs/content/docs/architecture/) — system overview, service/repository layers, Cloudflare bindings, and the argon2id hashing worker. The **Layer conventions** every contributor follows (server actions → `onServerAction`/services only, services hold business logic, repositories persist only, plus the `worker.ts` OpenNext-entry rule) are in [contributing/layer-conventions.mdx](apps/docs/content/docs/contributing/layer-conventions.mdx).
- [apps/docs/content/docs/features/](apps/docs/content/docs/features/) — OAuth/OIDC grants, clients & DCR, user auth, passkeys, MFA, tokens, admin surface. OIDC conformance is in [oidc-compliance.mdx](apps/docs/content/docs/oidc-compliance.mdx).
- [apps/docs/content/docs/getting-started/deployment.mdx](apps/docs/content/docs/getting-started/deployment.mdx) — remote/local setup, Wrangler config, secrets. Operational tasks (secrets/key rotation, upgrades, teardown) are under [operations/](apps/docs/content/docs/operations/).

## The docs site itself

[apps/docs/](apps/docs/) is a Fumadocs (Next.js) app that **statically exports** to GitHub Pages under the `/eetr-auth` basePath. Content is MDX in `content/docs/`; run `npm run docs:dev` locally and `npm run docs:build` to verify. It deploys on each release-please release and via the manual **Docs** workflow (`workflow_dispatch`).

## Database

[db/README.md](db/README.md) is authoritative on schema patches (it lives next to `schema.sql`). `schema.sql` is the fresh-install snapshot; `db/patches/<version>.sql` is the delta from the previous release. Every schema change updates both and bumps `schema_metadata.schema_version`. The public overview is [apps/docs/content/docs/database.mdx](apps/docs/content/docs/database.mdx).

## Keeping guidance current

When the user establishes a new design decision, convention, or process requirement, persist it in the canonical docs above rather than letting it live only in chat — update the closest existing section instead of creating a parallel copy:

- Layering / coding rules → [contributing/layer-conventions.mdx](apps/docs/content/docs/contributing/layer-conventions.mdx).
- UI / component / theming rules → [contributing/ux-guidelines.mdx](apps/docs/content/docs/contributing/ux-guidelines.mdx).
- Feature behavior and config → [features/](apps/docs/content/docs/features/) / [getting-started/deployment.mdx](apps/docs/content/docs/getting-started/deployment.mdx) / [reference/configuration.mdx](apps/docs/content/docs/reference/configuration.mdx).
- Schema rules → [db/README.md](db/README.md).

These docs are the single source of truth for all agents — keep guidance here, not in tool-specific config files. Editing the MDX both updates agent guidance and publishes to the docs site on the next release.
