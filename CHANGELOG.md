# Changelog

All notable changes to this monorepo are documented in this file.

The current released baseline for both the auth server and the client library is 0.2.0.

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
