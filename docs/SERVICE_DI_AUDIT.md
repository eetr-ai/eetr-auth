# Service DI Audit

Date: 2026-04-07
Scope: apps/auth service layer and composition boundaries
Status: Findings documented; no production refactor in this pass.

## Goal

Identify places where dependency injection by constructor is violated or weakened, especially where services construct concrete dependencies internally instead of receiving abstractions from a composition root.

## Severity 1: Constructor DI Violations

These services instantiate DB/repositories in their constructors. This hides dependencies, couples service tests to module mocks, and bypasses interface-based injection.

1. apps/auth/src/lib/services/user.service.ts
- Constructor uses getDb(ctx.env) and new UserRepositoryD1(db).
- Impact: tests need module mocks for DB/repo instead of direct constructor stubs.

2. apps/auth/src/lib/services/environment.service.ts
- Constructor uses getDb(ctx.env) and new EnvironmentRepositoryD1(db).
- Impact: difficult to unit test without mocking module factories.

3. apps/auth/src/lib/services/scope.service.ts
- Constructor uses getDb(ctx.env) and new ScopeRepositoryD1(db).
- Impact: service behavior cannot be tested with lightweight fake repositories.

4. apps/auth/src/lib/services/token-activity-log.service.ts
- Constructor uses getDb(ctx.env) and creates TokenActivityLogRepositoryD1, ClientRepositoryD1, EnvironmentRepositoryD1.
- Impact: cross-repository behavior tests require several global/module mocks.

5. apps/auth/src/lib/services/site-settings.service.ts
- Constructor uses getDb(ctx.env) and creates SiteSettingsRepositoryD1, SiteAdminApiClientsRepositoryD1, ClientRepositoryD1.
- Impact: constructor-level wiring is repeated in tests and is brittle.

## Severity 2: Weak DI Through Global Fallbacks

Services or helpers used by services fallback to process.env, weakening explicit constructor-supplied dependencies.

1. apps/auth/src/lib/services/transactional-email.service.ts
- getResendApiKey() and configuredFromAddress() fallback to process.env.
- Impact: test isolation depends on global env stubbing.

2. apps/auth/src/lib/services/site-settings.service.ts
- getResendApiKey() fallback to process.env.
- Impact: behavior can vary by global env rather than explicit constructor data.

3. Config resolvers called from service code with process.env fallback:
- apps/auth/src/lib/config/issuer-base-url.ts
- apps/auth/src/lib/config/hash-method.ts
- apps/auth/src/lib/auth/secret-at-rest.ts
- Impact: hidden dependency chain and broader test setup surface.

## Composition Boundary

apps/auth/src/lib/services/registry.ts is the current composition root and should own all concrete wiring.

Good examples already using constructor DI with dependencies supplied from registry:
- OauthTokenService
- OauthAuthorizationService
- UserChallengeService
- PasskeyService
- ClientService

Gaps:
- user/environment/scope/token-activity-log/site-settings still self-compose concrete dependencies in constructors.

## Recommended Follow-Up Refactor Order

1. Move constructor wiring for user/environment/scope services into registry.ts.
2. Move constructor wiring for token-activity-log and site-settings services into registry.ts.
3. Replace process.env fallbacks in service methods with explicit config values injected from the composition layer.
4. Keep resolver fallback logic limited to one boundary layer, not inside service methods.

## Constructor Shape Target

Each service constructor should receive only interfaces and resolved config values, for example:

- repositories as interface types
- resolved issuer URL string
- resolved hash method value
- optional bindings already selected by composition root

This keeps runtime wiring centralized and makes unit tests straightforward with local fakes.
