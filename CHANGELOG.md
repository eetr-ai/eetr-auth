# Changelog

All notable changes to this monorepo are documented in this file.

The current released baseline for both the auth server and the client library is 0.3.1.

## [0.5.1](https://github.com/eetr-ai/eetr-auth/compare/v0.5.0...v0.5.1) (2026-08-29)


### Features

* **admin-api:** create, list and revoke client API keys ([a592561](https://github.com/eetr-ai/eetr-auth/commit/a592561cf3a95847b3040fb1a497c654d00c449c))
* **auth:** exchange long-lived API keys for access tokens ([af04c15](https://github.com/eetr-ai/eetr-auth/commit/af04c1524acbc01c4a4041e59a1d6cfa5c48d266))
* **auth:** one-click test user sign-in ([5a38d14](https://github.com/eetr-ai/eetr-auth/commit/5a38d14ea9555536ed2fa078409144c491183db6))
* **client:** API key exchange and management in @eetr/eetr-auth-client ([278ebe6](https://github.com/eetr-ai/eetr-auth/commit/278ebe6f7f4db860ebbee1cd438d79b73da80732))
* **clients:** custom JWT claims per client ([c6464a7](https://github.com/eetr-ai/eetr-auth/commit/c6464a7001fce2642437ad031edf5dac86ba4b74))
* **clients:** test client flag through repo, service and admin UI ([f1b367d](https://github.com/eetr-ai/eetr-auth/commit/f1b367defe3941ca01e5559b8e0bd4a90313ca40))
* **consent:** record, skip, and revoke end-user consent ([8482dcc](https://github.com/eetr-ai/eetr-auth/commit/8482dcc30cb3ce369aa7c719fd9e80cb488ee4c6))
* **dashboard:** manage a client's API keys from the client panel ([0770e67](https://github.com/eetr-ai/eetr-auth/commit/0770e672b45f8ecd793d8cb312d841ad80f6f40b))
* **db:** add client_claims to schema 0.6.0 ([0928839](https://github.com/eetr-ai/eetr-auth/commit/092883941fa9f9c847348ed7e266fe69ccc3d03c))
* **db:** add users.is_test_user and clients.is_test ([12e6b20](https://github.com/eetr-ai/eetr-auth/commit/12e6b20c14eaab03bf34103288c5c24008dd7edf))
* **db:** api_keys and api_key_scopes tables ([9ea76ed](https://github.com/eetr-ai/eetr-auth/commit/9ea76ed207c3ab99050fe68635b0e6a18a75653a))
* **db:** reject malformed JSON in client_claims ([df7efa3](https://github.com/eetr-ai/eetr-auth/commit/df7efa324086fc24649ef18813cda3f96f219374))
* **db:** schema 0.6.0 — scope consent copy, consent records, env display name ([0ce365a](https://github.com/eetr-ai/eetr-auth/commit/0ce365aee9efbda267be59b6193945dbbd5d89aa))
* **environments:** human-readable display name ([583f718](https://github.com/eetr-ai/eetr-auth/commit/583f7181fc30c5710da4771de199e50e24299297))
* long-lived API keys for CI/CD ([e74b13c](https://github.com/eetr-ai/eetr-auth/commit/e74b13c588b569d40172f5eea7b04ff24bcc9df7))
* **oauth:** confine test users to test clients ([69cbb77](https://github.com/eetr-ai/eetr-auth/commit/69cbb7724e3f1996a28b666873d12517237c2b9c))
* **scopes:** human-readable consent copy for scopes ([cd3ae04](https://github.com/eetr-ai/eetr-auth/commit/cd3ae0475c4ad4e628c92fb105610e601ba9045c))
* test clients and passwordless test users ([b660ef4](https://github.com/eetr-ai/eetr-auth/commit/b660ef416319592d8bc9bf863452883e9842d6d8))
* **users:** passwordless test users through repo, service and admin UI ([37283af](https://github.com/eetr-ai/eetr-auth/commit/37283afb0e40a378a11d1c65aec0e3430d38e875))


### Bug Fixes

* address CodeRabbit findings on API keys ([68397a6](https://github.com/eetr-ai/eetr-auth/commit/68397a6fea0b56c0ee817405f6f3ef6b50c95794))
* address review findings on test clients and test users ([6ab68d7](https://github.com/eetr-ai/eetr-auth/commit/6ab68d7abc007a5ca02b8d6d3b226c07d0052543))
* **auth:** call argon-hasher with a URL, and honor HASH_METHOD for API keys ([8f1c01b](https://github.com/eetr-ai/eetr-auth/commit/8f1c01b1ebaae531747985e8e5d446eefeeab5ef))
* **dashboard:** repair the API keys table and button layout ([713be16](https://github.com/eetr-ai/eetr-auth/commit/713be16841b18d92dc42b059013d88902c93d647))

## [0.5.0](https://github.com/eetr-ai/eetr-auth/compare/v0.4.0...v0.5.0) (2026-08-15)


### ⚠ BREAKING CHANGES

* **db:** databases must run db/patches/0.5.0.sql (new client/token columns and the dcr_rate_limit table) before deploying this release. This is a version bump to 0.5.0; there is no 0.4.3 patch.

### Features

* **admin:** open panels by row click and show a client's tokens in place ([477609f](https://github.com/eetr-ai/eetr-auth/commit/477609fda5273ddb8c2c04449b3e515d23f25cf9))
* **admin:** surface dynamically registered clients ([c55886a](https://github.com/eetr-ai/eetr-auth/commit/c55886adeb13e8e82baf9b84e45aef4e62b9012f))
* **client:** add DCR registerClient and resource-indicator support ([38a1a0a](https://github.com/eetr-ai/eetr-auth/commit/38a1a0a1cff182896b42ae28c90c4e09be1c6487))
* **clients:** rebuild Clients on the directory idiom and retire the detail route ([73c8acd](https://github.com/eetr-ai/eetr-auth/commit/73c8acd5945b6b54964d8eb0be90286d1ddcbfa9))
* **db:** require 0.5.0 schema migration for DCR and resource support ([68affc6](https://github.com/eetr-ai/eetr-auth/commit/68affc61ff1072628f34855b1dc73550ae07e4f8))
* **db:** schema for public clients, DCR, and resource binding ([d4db830](https://github.com/eetr-ai/eetr-auth/commit/d4db8306020058402d5437c76b034edd6dd06386))
* **docs:** scaffold Fumadocs static-export app ([ff755ef](https://github.com/eetr-ai/eetr-auth/commit/ff755efa3116ccc5223e210427588f9a45ca5ee0))
* Dynamic Client Registration (RFC 7591) with public clients and resource indicators ([31008cc](https://github.com/eetr-ai/eetr-auth/commit/31008cca59475cd51b0eb9f57194e4001bbd92a9))
* **oauth:** add loopback URI matching helper ([4e6890f](https://github.com/eetr-ai/eetr-auth/commit/4e6890fd8c7a12af36816fd50f2b66b665175559))
* **oauth:** advertise DCR, public clients, and refresh in discovery ([c6b4cb3](https://github.com/eetr-ai/eetr-auth/commit/c6b4cb376aaf975f18dbd83d541b4ce1e6a851dd))
* **oauth:** dynamic client registration endpoint with rate limiting ([4228d1b](https://github.com/eetr-ai/eetr-auth/commit/4228d1b30f3b126314a1aeb372c92ce966b801da))
* **oauth:** enable CORS on authorize, token, and userinfo endpoints ([fab55d2](https://github.com/eetr-ai/eetr-auth/commit/fab55d2bc3fe10d43083b5eb8b53acfbd1ca8894))
* **oauth:** enable CORS on authorize, token, and userinfo endpoints ([28fa608](https://github.com/eetr-ai/eetr-auth/commit/28fa60890d278744d90cdd9cffbe6910aa81c8c9))
* **oauth:** resource-indicator audience binding (RFC 8707) ([2920669](https://github.com/eetr-ai/eetr-auth/commit/292066993080b9ffaff17eed69d778220d517df0))
* **oauth:** show client name, scopes, and resource on consent ([115386c](https://github.com/eetr-ai/eetr-auth/commit/115386ca8b592e82b0fc900367baf95ee2890fc8))
* **oauth:** support public (PKCE-only) clients ([8fc0682](https://github.com/eetr-ai/eetr-auth/commit/8fc0682081f6a6310f37f3e9d91e55cc37196358))
* **setup:** merge Environments and Scopes into a Basic tab ([c1b34ab](https://github.com/eetr-ai/eetr-auth/commit/c1b34abff335e4ec349620445ed2e6efdcb1a035))
* **setup:** move the password policy form into a slide-in panel ([47c6294](https://github.com/eetr-ai/eetr-auth/commit/47c629411a15fb5f8048bdd2f2501620a338808b))
* **tokens:** compact the token table onto glyphs and double-purpose cells ([08ffb88](https://github.com/eetr-ai/eetr-auth/commit/08ffb88cf984c1eec6761f7463de5be84d6bfb32))
* **ui:** add a two-tier theme layer and apply it to the primitives ([5131cf2](https://github.com/eetr-ai/eetr-auth/commit/5131cf2e2ecbd71c8a33da328eb37ce50fd8df71))
* **ui:** add surface primitives and move every screen onto the theme ([913787e](https://github.com/eetr-ai/eetr-auth/commit/913787ea0a68091f73df9e53a4b3e15a47494d3a))
* **uploads:** stage files on the CDN and promote them when the form saves ([03353e2](https://github.com/eetr-ai/eetr-auth/commit/03353e2cad45c8cfd6affcc557629a5e5a589a1b))
* **uploads:** stage files on the CDN and promote them when the form saves ([bb91599](https://github.com/eetr-ai/eetr-auth/commit/bb91599edd836ad556962a14af7e3889aa61de13))
* **users:** rebuild Users on the shared directory idiom ([bba4f1e](https://github.com/eetr-ai/eetr-auth/commit/bba4f1e119873cc65822c77f170fb2fd4b6a4380))


### Bug Fixes

* **assets:** honour the site CDN URL for avatars, not just the logo ([bf5b97e](https://github.com/eetr-ai/eetr-auth/commit/bf5b97e4b63ce09436b17427a80280c45381d6f2))
* **docs:** enable trailingSlash for GitHub Pages ([7b5f78c](https://github.com/eetr-ai/eetr-auth/commit/7b5f78cc2d4cc30c15a55bcdece93a4d9eefaaf2))
* **docs:** enable trailingSlash for GitHub Pages ([6ec99b3](https://github.com/eetr-ai/eetr-auth/commit/6ec99b367b04a0ad0f9a3be20f90b7f3381032eb))
* **oauth:** accept loopback redirect_uris registered under another host ([8725b8c](https://github.com/eetr-ai/eetr-auth/commit/8725b8c9d20749e7ad3d2db9b2fc324d00d1dde7))
* **oauth:** accept loopback redirect_uris registered under another host ([2239ff4](https://github.com/eetr-ai/eetr-auth/commit/2239ff45d3f92c68e37c8eeb6449b4a4b0b1a571))
* **oauth:** canonicalize loopback resource indicators ([e311e59](https://github.com/eetr-ai/eetr-auth/commit/e311e59156732724ce2c497dac1e1b5bf042786a))
* **oauth:** drop the asymmetric localhost shortcut in the canonicalizer ([9451e6c](https://github.com/eetr-ai/eetr-auth/commit/9451e6c0bb99ae31f01a733f510d5173e40539b7))
* **uploads:** buffer the staged object when promoting it ([3756889](https://github.com/eetr-ai/eetr-auth/commit/3756889e3e2de9a46c0a27d93bd010952eeea77e))
* **uploads:** release preview URLs on unmount and fail loudly on spawn errors ([06d26c2](https://github.com/eetr-ai/eetr-auth/commit/06d26c2ae39305a5c6f19720ff5335209d39392f))
* **uploads:** restore the one-call avatar API and stage only for forms ([9bd38ff](https://github.com/eetr-ai/eetr-auth/commit/9bd38ffccbfd45421d99b6841ecd28ee44578781))

## [0.4.0](https://github.com/eetr-ai/eetr-auth/compare/v0.3.1...v0.4.0) (2026-06-06)


### ⚠ BREAKING CHANGES

* **oidc:** the database schema is bumped to 0.4.0 and requires applying db/patches/0.4.0.sql (npm run db:migrate / db:migrate:remote) before deploying; the new authorization_codes columns are absent on older databases. Additionally, access tokens minted via the direct POST /authorize path now carry `sub = user.id` instead of the username, so relying parties that keyed off the username `sub` must migrate to user.id (consistent with /userinfo).

### Features

* **audit:** cover client and setup management in the admin audit trail ([d2fca4a](https://github.com/eetr-ai/eetr-auth/commit/d2fca4ad41e42c1d34bb38d919f6ca9d938fdc38))
* **client:** mirror id_token + nonce in @eetr/eetr-auth-client ([cabf463](https://github.com/eetr-ai/eetr-auth/commit/cabf46388690012cae444d049bf87a52932756d1))
* **client:** OIDC scope helpers, insufficient_scope handling, profile normalizer ([86039ca](https://github.com/eetr-ai/eetr-auth/commit/86039ca8df4688032f52f22c02e0ed7aa59f7ccc))
* **db:** seed default OIDC scopes (openid, profile, email) ([9a64de3](https://github.com/eetr-ai/eetr-auth/commit/9a64de3265f532c57b33847e67220bc221fdcdff))
* **oauth:** enforce user environment access at sign-in and authorization ([71894b4](https://github.com/eetr-ai/eetr-auth/commit/71894b4a4a45ccc692c511ab41a529ff244aa192))
* **oidc:** issue signed id_token with standard claims for the openid scope ([6787239](https://github.com/eetr-ai/eetr-auth/commit/678723939e21f86eadc6e9f1741f4a023982bce2))
* **oidc:** OpenID Connect compliance — id_token, nonce, discovery ([635bba0](https://github.com/eetr-ai/eetr-auth/commit/635bba0d2d23f0820c3d5af543e7e4060f45831f))
* **oidc:** persist nonce + auth_time on auth codes and standardize sub on user.id ([5434015](https://github.com/eetr-ai/eetr-auth/commit/5434015760173d1d0ae19a748edece319d00141e))
* **oidc:** reconcile discovery metadata with implemented behavior ([bff406d](https://github.com/eetr-ai/eetr-auth/commit/bff406dafeed8b221f1239dadfa0b42dac6d8eb2))
* **password-policy:** add complexity validation utility (not yet wired) ([d99370a](https://github.com/eetr-ai/eetr-auth/commit/d99370a71a3c0e6bb87c22834955d9f95a26492b))
* **password-policy:** add dashboard server actions ([ab1c4a9](https://github.com/eetr-ai/eetr-auth/commit/ab1c4a9f2cf9d67bbf14eda7931cec303c941644))
* **password-policy:** add Password policies tab to Setup ([34d812e](https://github.com/eetr-ai/eetr-auth/commit/34d812ef0b0e5be5b1764404e6120f65b761c867))
* **password-policy:** add PasswordPolicyService + registry wiring ([74cc9d7](https://github.com/eetr-ai/eetr-auth/commit/74cc9d786dce3dab4ce16769f15dc9555ce04ee6))
* **password-policy:** add policy repository + password-age stamping ([f9935ee](https://github.com/eetr-ai/eetr-auth/commit/f9935ee1c64ddd781d2b0d9a25e578c48491e00d))
* **password-policy:** enforce + live-validate admin policy on password change ([a59d187](https://github.com/eetr-ai/eetr-auth/commit/a59d187ffecfde71eb01298e663b16ba412512d7))
* **password-policy:** enforce password max age at login ([fffda25](https://github.com/eetr-ai/eetr-auth/commit/fffda25dfa043dc27f73ff113babc1307a808d87))
* **password-policy:** per-class minimum counts + admin sign-in policy ([3e8743d](https://github.com/eetr-ai/eetr-auth/commit/3e8743d41c662c385e541d593825bfd74f8dfda0))
* **password-policy:** prompt to change a non-compliant password at sign-in ([c3bdf0b](https://github.com/eetr-ai/eetr-auth/commit/c3bdf0be5745340c927aff73fa418eddc063ba36))
* **scripts:** back up wrangler.generated.jsonc before re-rendering ([981edb0](https://github.com/eetr-ai/eetr-auth/commit/981edb0f60a5f524cf850a245a65545b2e6e05d4))
* **scripts:** seed local R2 JWKS on setup + add verify / verify:remote ([23050ea](https://github.com/eetr-ai/eetr-auth/commit/23050ea657c918cbd3d5d6135401903a8091776f))
* **users:** assign/remove environments per user in the users list ([6e136bc](https://github.com/eetr-ai/eetr-auth/commit/6e136bc53cf9fb0ec668ded32146064d5cd1de95))
* **users:** manage per-user environment grants (backend) ([0e4f1f9](https://github.com/eetr-ai/eetr-auth/commit/0e4f1f992bd1326a5ba1fa21da24db994b709ae5))


### Bug Fixes

* **admin:** added check for admin on admin-only server actions ([77663de](https://github.com/eetr-ai/eetr-auth/commit/77663de152f711d9f996a96195583f1a1e09bd21))
* **admin:** enforced redirect outside the admin layout for non-admin users ([23e26dd](https://github.com/eetr-ai/eetr-auth/commit/23e26dd5d3c4a20f26b31ccc390501b6d6e0ee33))
* **admin:** Security audit fixes ([4dae255](https://github.com/eetr-ai/eetr-auth/commit/4dae255f1216919757e854c87cc7f0508b0af21a))
* **auth:** invalidate pending password-reset links on password change ([34db753](https://github.com/eetr-ai/eetr-auth/commit/34db753a46ac426e4d4f2c7efb87e4ac2435fc99))
* **auth:** re-derive isAdmin from the DB on JWT session reads ([6b5c77f](https://github.com/eetr-ai/eetr-auth/commit/6b5c77f1377aff396af0a2c3b3525cefd4172a2e))
* **deploy:** pin Cloudflare account so wrangler targets the right one ([0d702f4](https://github.com/eetr-ai/eetr-auth/commit/0d702f4cfa72dae16aa4910c0b08b01883e6258f))
* **oauth:** bind token audience and scope-gate /userinfo claims ([61b9c5c](https://github.com/eetr-ai/eetr-auth/commit/61b9c5c72b4c75965daf5cec4e3c16805dd8b9ec))
* **oauth:** expire family access tokens on refresh-token reuse ([db91add](https://github.com/eetr-ai/eetr-auth/commit/db91add3185443823c51abbd310ad31d988c53e5))
* **oauth:** re-check user environment access on refresh-token grant ([6b854b5](https://github.com/eetr-ai/eetr-auth/commit/6b854b5b3e4612c4dc206bc89d19332493fbadbb))
* only enforce email verification on passkey sign-in when email MFA is enabled ([0d44579](https://github.com/eetr-ai/eetr-auth/commit/0d445790aa8fb1c3d840346b3809f90b5b15fe5d))
* only require email verification when email MFA is enabled globally ([97597ba](https://github.com/eetr-ai/eetr-auth/commit/97597bae5a245e05009b4b5ed1c4658c6d57af42))
* **security:** H1 atomic single-use authorization codes ([cc7ff48](https://github.com/eetr-ai/eetr-auth/commit/cc7ff486d6b1646dc28603ee9360bec736de890d))
* **security:** H2 atomic refresh-token rotation with chain revocation ([5267f68](https://github.com/eetr-ai/eetr-auth/commit/5267f68aabda2a00214e111b204033c348594f04))
* **security:** H3 secure-by-default password hashing ([65e6765](https://github.com/eetr-ai/eetr-auth/commit/65e676547e645a8e6ad44781925a27fdcc6cdcd8))
* **security:** H5 whitelist user updates and audit admin-rights changes ([d4e1601](https://github.com/eetr-ai/eetr-auth/commit/d4e1601f711669407299015207f525c84e5cc799))
* **users:** don't auto-verify email when admin user created without one ([c772ee9](https://github.com/eetr-ai/eetr-auth/commit/c772ee9473160f3255f40a0c9415db5e88c93812))

## [0.3.1](https://github.com/eetr-ai/eetr-auth/compare/v0.3.0...v0.3.1) (2026-05-31)


### Bug Fixes

* adding users now gets audited ([58befba](https://github.com/eetr-ai/eetr-auth/commit/58befba951e5a86818d23c6a154737c73fc1bce3))
* **audit:** added audit logs on user updates and password change ([c4ce72f](https://github.com/eetr-ai/eetr-auth/commit/c4ce72f7f1d3b1c96dace4d08f4d59fbf3acf511))
* **audit:** audit when user resets password ([b760b7f](https://github.com/eetr-ai/eetr-auth/commit/b760b7fe98cbbee2678aef99ad1970c33d4f8530))
* **deploy:** drop invalid --skipWranglerConfigCheck wrangler flag ([7dc0989](https://github.com/eetr-ai/eetr-auth/commit/7dc09899987b6d249aa54bf6f44face6f116deba))
* **deploy:** drop invalid --skipWranglerConfigCheck wrangler flag ([f449586](https://github.com/eetr-ai/eetr-auth/commit/f449586860758417e2fdb9823ccee0b4613a19fe))
* **deploy:** point build/upload/preview at wrangler.generated.jsonc ([d58dd8a](https://github.com/eetr-ai/eetr-auth/commit/d58dd8ad2e58c5896122eada9e1c8ef442632092))
* General fixes ([91ef540](https://github.com/eetr-ai/eetr-auth/commit/91ef540ae921794369ff72129d10e30d08c30700))

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
