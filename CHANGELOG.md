# Changelog

All notable changes to this monorepo are documented in this file.

The current released baseline for both the auth server and the client library is 0.2.0.

## [0.3.0](https://github.com/eetr-ai/eetr-auth/compare/v0.2.0...v0.3.0) (2026-05-31)


### ⚠ BREAKING CHANGES

* **mfa:** adds the `user_totp` table. Existing deployments must apply the 0.3.0 schema patch (npm run db:migrate / db:migrate:remote) before this code path is used.

### Features

* Allow multiple passkeys from the same user ([25f27bf](https://github.com/eetr-ai/eetr-auth/commit/25f27bf1fff6162992294137a7098daae30fa085))
* **api:** added passkey operations to the API ([ae19801](https://github.com/eetr-ai/eetr-auth/commit/ae1980198fa1b84c7800ee9f32b18a038c5fd36b))
* **auth:** added backend and db schema support for multiple user passkeys ([f8984b6](https://github.com/eetr-ai/eetr-auth/commit/f8984b6007aeeddbcea71c956507d47a744e17d1))
* **auth:** added platform name detection ([4be4f8e](https://github.com/eetr-ai/eetr-auth/commit/4be4f8e1e2ceeb99ad9b5e3530b96a8a42605a46))
* **client:** added passkey management ([cc2d281](https://github.com/eetr-ai/eetr-auth/commit/cc2d28127525020c79b7fbc5b2ee62f5176402f4))
* Google auth ([057c80e](https://github.com/eetr-ai/eetr-auth/commit/057c80e222ca5191131fb5b91407d99d7139db85))
* **mfa:** add authenticator-app enrollment UI and actions ([88decde](https://github.com/eetr-ai/eetr-auth/commit/88decde38284c6c507036a0506ae9cf3bec58a74))
* **mfa:** add TOTP authenticator data layer and core ([fca0734](https://github.com/eetr-ai/eetr-auth/commit/fca0734d76254a187c431aa5e59999e1df79cd64))
* **mfa:** wire authenticator-app (TOTP) into the sign-in flow ([1cee9fd](https://github.com/eetr-ai/eetr-auth/commit/1cee9fd3b6b247291550ddb8941ab01c436a9eb6))
* Themes ([6e94b9b](https://github.com/eetr-ai/eetr-auth/commit/6e94b9b010c21be9b71e7cd45e99dfed57f900e7))
* **ui:** add light/dark theme CSS tokens and no-flash init script ([6cacfde](https://github.com/eetr-ai/eetr-auth/commit/6cacfdef5d780e408fa2420d8d4038c515ada8c8))
* **ui:** add light/dark/system theme switcher to main UI ([3f2b71e](https://github.com/eetr-ai/eetr-auth/commit/3f2b71e0ba51dd0f16084a353628cfbc93f3d5b0))
* **ui:** added passkey management in user settings ([e96b505](https://github.com/eetr-ai/eetr-auth/commit/e96b5057ce8825787e467233e46bd8a8fe318dd6))
* **ui:** added verify on this device to check if passkeys are working ([43d2a77](https://github.com/eetr-ai/eetr-auth/commit/43d2a77dc184097d7233bd007d984313cb1a05e0))
* **ui:** passkeys are now offered when clicking username field ([96ae885](https://github.com/eetr-ai/eetr-auth/commit/96ae8853e8e6db00aa93f8ac9b901787a6d9ddfc))
* **ui:** support light theme on admin dashboard pages ([d853665](https://github.com/eetr-ai/eetr-auth/commit/d853665cec0c30b6d84332de758cfe6908e860a0))
* **ui:** support light theme on public/auth pages ([31cc706](https://github.com/eetr-ai/eetr-auth/commit/31cc706268e3eafaa067e18a7a2566f0f46a4a07))


### Bug Fixes

* **ci:** sync package-lock.json with 0.2.0 workspace versions ([9d956d0](https://github.com/eetr-ai/eetr-auth/commit/9d956d0773f72bfe4d34286275784a0baf757f43))
* **ui:** equalize settings card height per row, not globally ([b37889d](https://github.com/eetr-ai/eetr-auth/commit/b37889d5f9be86f5e5e897c8d2d1b49f1cecfe8a))
* **users:** guard self-deletion before resolving the user ([63d6547](https://github.com/eetr-ai/eetr-auth/commit/63d654705d7ae920a49d140e049acf8a94ee13bf))

## [0.2.0] - 2026-04-22

Second release. Focused on admin usability, passkey self-service, audit trail, and schema migration safety.

### Auth server (`@eetr/auth`)

- **Admin audit log** — every privileged admin action is now recorded in the new `admin_audit_log` table and surfaced in the admin UI.
- **User deletion hardening** — added an inline confirmation step before deleting a user, and fixed a FOREIGN KEY constraint failure that prevented deleting users who had ever created an OAuth client. The `clients.created_by` FK now uses `ON DELETE SET NULL`.
- **Passkey self-enrollment** — any signed-in user can now enroll a passkey for themselves from their profile, not just admins.
- **Admin API** — ability to read a user's details by id, plus the JWT `sub` claim fix for admin-issued tokens.
- **Email polish** — email templates now fall back gracefully when no default logo is configured.
- **API spec** — title and operations updated to match the current admin API surface.

### Client library (`@eetr/eetr-auth-client`)

- Regenerated typed API client to match the new admin-API operations (read user by id, etc.).

### Database

- New schema patch `db/patches/0.2.0.sql`:
  - Rebuilds `clients` with a nullable `created_by` and `ON DELETE SET NULL`.
  - Adds `admin_audit_log` and its indexes.
- `schema.sql` snapshot updated to schema version `0.2.0`.

### Documentation

- New [docs/UX_GUIDELINES.md](docs/UX_GUIDELINES.md) covering destructive-action confirmations, button/banner/card conventions, icon vocabulary, and color tokens for any UI work under `apps/auth`.
- `CLAUDE.md` now points at the UX guidelines for UI changes.

## [0.1.0] - 2026-04-06

Initial monorepo release.

- Auth server: `@eetr/auth`, an OAuth 2.1 and OpenID Connect server on Cloudflare Workers with D1, R2, admin UI, MFA, passkeys, email verification, and token management.
- Client library: TypeScript ESM client for discovery, token exchange, userinfo, token refresh, and JWT validation.
- Infrastructure: Terraform-backed Cloudflare provisioning and Wrangler deployment flow.
- Testing: Vitest-based unit test coverage for the auth server and the client library.
