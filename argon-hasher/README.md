# argon-hasher (Cloudflare Worker, Rust)

Internal **Argon2id** hash / verify HTTP API for use behind a [Service Binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/) from another Worker. Requests without the expected `ctx.props` are rejected with **403**.

## API

| Method | Path | Body | Response |
|--------|------|------|----------|
| `POST` | `/hash` | `{"password":"..."}` | `200` `{"hash":"..."}` |
| `POST` | `/verify` | `{"password":"...","hash":"..."}` | `200` `{"valid": <bool>}` |

Other paths → **404**; wrong method on `/hash` or `/verify` → **405**; bad JSON / validation → **400**; missing / invalid service-binding context → **403** with `{"error":"..."}`.

## Argon2 parameters

| Parameter | Value |
|-----------|--------|
| Variant | argon2id |
| Memory `m` | 19,456 KiB (~19 MiB) — tuned for Cloudflare Workers CPU/memory limits |
| Time `t` | 3 |
| Parallelism `p` | 1 |
| Output length | 32 bytes (PHC string) |
| Salt | 16 random bytes (`SaltString` / PHC) |

## Timing logs

Each request logs **only** Argon2 wall time (ms), e.g. `argon2 hash: 42.30ms` / `argon2 verify: 38.10ms`. Passwords and hashes are never logged.

View logs with:

- `npx wrangler dev` (terminal output)
- `npx wrangler tail` (deployed Worker)
- [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) in the dashboard

## Toolchain

1. Install [Rust](https://rustup.rs/) (this repo uses `rust-toolchain.toml`: **stable** + `wasm32-unknown-unknown`).
2. Add the Wasm target:

   ```bash
   rustup target add wasm32-unknown-unknown
   ```

3. Install the Workers build tool (also run automatically from `wrangler.toml` `[build]`):

   ```bash
   cargo install worker-build --version '^0.7'
   ```

4. Install [Wrangler](https://developers.cloudflare.com/workers/wrangler/) (via `npm`/`npx`).

## Build

```bash
cargo check --target wasm32-unknown-unknown
worker-build --release
```

Wrangler runs the same build when you `deploy` / `dev`.

## Deploy

Deploy **this** Worker **before** any caller that binds to it.

```bash
npx wrangler deploy
```

**CPU limits:** Argon2 is expensive. The [Workers Free plan](https://developers.cloudflare.com/workers/platform/limits/#cpu-time) allows **10 ms** CPU per request; this workload usually needs **Workers Paid** and may require raising the per-invocation CPU limit, e.g. in `wrangler.toml`:

```toml
[limits]
cpu_ms = 30000
```

## Caller Worker: service binding + `props`

The **caller** (sibling) Worker’s `wrangler.toml` must declare a binding to **this** Worker’s name and pass **`props`** so the hasher can validate `ctx.props` (see [Context `props`](https://developers.cloudflare.com/workers/runtime-apis/context/#props)):

```toml
[[services]]
binding = "ARGON_HASHER"
service = "argon-hasher"  # must match this Worker’s `name` in wrangler.toml

  [services.props]
  internal = true
```

Call from the caller:

```js
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    url.pathname = "/hash";
    const req = new Request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "secret" }),
    });
    return env.ARGON_HASHER.fetch(req);
  },
};
```

Deploy order: **`argon-hasher` first**, then the caller.

## Defense in depth

- Set `workers_dev = false` and avoid public routes if this Worker should only be reachable via service bindings.
- Direct HTTP to `wrangler dev` often **does not** include binding `props`; use multi-service dev (`wrangler dev -c …`) or call through the binding.

## Local development

```bash
npx wrangler dev
```

Then exercise `POST /hash` and `POST /verify` (you will get **403** unless props are present—use a paired dev session with a caller Worker, or adjust for testing as needed).
