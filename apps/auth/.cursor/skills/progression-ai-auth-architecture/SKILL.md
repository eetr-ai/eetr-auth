---
name: progression-ai-auth-architecture
description: Architecture and patterns for progression-ai-auth (Next.js, D1, Auth.js, server actions, services, reducers, lucide-react)
---

# Progression AI Auth – Architecture

## Layers

1. **Entry**: Server actions (`src/app/actions/`) and API routes (`src/app/api/`). No business logic; they call `onServerAction` or `withApiContext` and then service methods only. Session/current user: use Auth.js `auth()` in actions; no service for session.
2. **Wrapper**: `onServerAction` and `withApiContext` in `src/lib/context/` build `RequestContext` from `getCloudflareContext()`, call `getServices(ctx)`, and pass context + getter into the callback.
3. **Services**: `src/lib/services/`. All business logic. Receive `RequestContext` and use repositories for persistence. See `.cursor/rules/architecture.mdc`.
4. **Persistence**: `src/lib/repositories/`. D1 repositories; no business rules. DB comes from `getDb(ctx.env)` in the service layer.
5. **Frontend state**: `src/context/` (or `src/store/`). Use `@eetr/react-reducer-utils`: `bootstrapProvider(reducer, initialState)` → Provider + hook. No ad-hoc global state.
6. **Icons**: `lucide-react` only; named imports.

## Authentication (Auth.js)

- **Auth.js** (next-auth v5): `src/auth.ts` config with Credentials provider, JWT session, callbacks (`jwt`, `session`, `authorized`). Route handler: `src/app/api/auth/[...nextauth]/route.ts` exports `handlers` GET/POST.
- **Credentials**: `authorize` uses `getCloudflareContext()` + D1 + admin repository to verify username/password (e.g. MD5 compare). Return `{ id, name }` for session.user.
- **Current user**: In server actions call `auth()` from `@/auth` and return `session?.user ?? null`. No UserService for session.
- **Middleware**: Export `auth` as middleware from `@/auth`; use matcher to exclude `/api/auth`, static assets. Protect `/dashboard` (and admin routes) via `authorized` callback; unauthenticated users redirect to `pages.signIn` (e.g. `/login`).

## Assets and theming

- **Logo / images**: Use `next/image` for app assets (e.g. `public/logo.png`). No remote config needed for local public files.
- **Theme**: Default is dark (black background + ProgressionAI blue). Palette and CSS variables in `src/app/globals.css`; expose via `@theme` for Tailwind (e.g. `--color-brand`, `--color-brand-muted`, `bg-brand`, `border-brand-muted`).

## UI conventions

- **Buttons**: Use `rounded-full` (pill shape) for all buttons.
- **Containers**: Use `rounded-xl` for cards, panels, and container wrappers (e.g. login card, content blocks).

## Adding features

- New domain: add service + repository; expose via server action or API route using the wrappers.
- New client state: add a reducer module under `src/context/`, bootstrap provider, wrap layout or subtree, use the hook in components.
- Follow `.cursor/rules/` for server-actions, reducer-pattern, and ui-icons.
