---
name: progression-ai-auth-architecture
description: Architecture and patterns for progression-ai-auth (Next.js, D1, server actions, services, reducers, lucide-react)
---

# Progression AI Auth – Architecture

## Layers

1. **Entry**: Server actions (`src/app/actions/`) and API routes (`src/app/api/`). No business logic; they call `onServerAction` or `withApiContext` and then service methods only.
2. **Wrapper**: `onServerAction` and `withApiContext` in `src/lib/context/` build `RequestContext` from `getCloudflareContext()`, call `getServices(ctx)`, and pass context + getter into the callback.
3. **Services**: `src/lib/services/`. All business logic. Receive `RequestContext` and use repositories for persistence. See `.cursor/rules/architecture.mdc`.
4. **Persistence**: `src/lib/repositories/`. D1 repositories; no business rules. DB comes from `getDb(ctx.env)` in the service layer.
5. **Frontend state**: `src/context/` (or `src/store/`). Use `@eetr/react-reducer-utils`: `bootstrapProvider(reducer, initialState)` → Provider + hook. No ad-hoc global state.
6. **Icons**: `lucide-react` only; named imports.

## Adding features

- New domain: add service + repository; expose via server action or API route using the wrappers.
- New client state: add a reducer module under `src/context/`, bootstrap provider, wrap layout or subtree, use the hook in components.
- Follow `.cursor/rules/` for server-actions, reducer-pattern, and ui-icons.
