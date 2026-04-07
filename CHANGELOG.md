# Changelog

All notable changes to this monorepo are documented in this file.

The current released baseline for both the auth server and the client library is 0.1.0.

## [0.1.0] - 2026-04-06

Initial monorepo release.

- Auth server: OAuth 2.1 and OpenID Connect server on Cloudflare Workers with D1, R2, admin UI, MFA, passkeys, email verification, and token management.
- Client library: TypeScript ESM client for discovery, token exchange, userinfo, token refresh, and JWT validation.
- Infrastructure: Terraform-backed Cloudflare provisioning and Wrangler deployment flow.
- Testing: Vitest-based unit test coverage for the auth server and the client library.