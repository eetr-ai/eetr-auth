//! Cloudflare Worker: Argon2id hash and verify API (internal service binding + ctx.props).

use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::{Algorithm, Argon2, Params, Version};
use rand_core::OsRng;
use serde::{Deserialize, Serialize};
use worker::*;

/// Tuned for Cloudflare Workers CPU/memory limits.
const M_COST_KIB: u32 = 19_456;
const T_COST: u32 = 3;
const P_COST: u32 = 1;
/// PHC output length (bytes), matches hash-wasm `hashLength`.
const HASH_OUTPUT_LEN: usize = 32;

/// Deserialize-only: the **caller** Worker must set matching `[[services]]` `props` in its Wrangler config.
#[derive(Deserialize)]
struct ServiceBindingProps {
    /// Must be `true` on the binding for this Worker to accept the request.
    internal: bool,
}

fn argon2_hasher() -> Result<Argon2<'static>> {
    let params = Params::new(M_COST_KIB, T_COST, P_COST, Some(HASH_OUTPUT_LEN))
        .map_err(|e| Error::RustError(format!("argon2 params: {e}")))?;
    Ok(Argon2::new(Algorithm::Argon2id, Version::V0x13, params))
}

fn require_service_binding(ctx: &Context) -> Result<()> {
    let props = ctx
        .props::<ServiceBindingProps>()
        .map_err(|_| Error::RustError("forbidden".into()))?;
    if !props.internal {
        return Err(Error::RustError("forbidden".into()));
    }
    Ok(())
}

fn json_response<T: Serialize>(status: u16, body: &T) -> Result<Response> {
    let mut res = Response::from_json(body)?;
    res.headers_mut().set("Content-Type", "application/json")?;
    Ok(res.with_status(status))
}

fn json_error(status: u16, message: &str) -> Result<Response> {
    json_response(
        status,
        &serde_json::json!({
            "error": message
        }),
    )
}

fn now_ms() -> f64 {
    js_sys::Date::now()
}

#[derive(Deserialize)]
struct HashRequest {
    password: String,
}

#[derive(Serialize)]
struct HashResponse {
    hash: String,
}

#[derive(Deserialize)]
struct VerifyRequest {
    password: String,
    hash: String,
}

#[derive(Serialize)]
struct VerifyResponse {
    valid: bool,
}

async fn handle_hash(mut req: Request, ctx: Context) -> Result<Response> {
    require_service_binding(&ctx)?;
    let body: HashRequest = match req.json().await {
        Ok(b) => b,
        Err(_) => return json_error(400, "invalid JSON body"),
    };
    if body.password.is_empty() {
        return json_error(400, "missing or empty password");
    }

    let argon2 = argon2_hasher()?;
    // 16 random bytes encoded in PHC salt string (see password-hash / SaltString).
    let salt = SaltString::generate(&mut OsRng);
    let t0 = now_ms();
    let hash = argon2
        .hash_password(body.password.as_bytes(), &salt)
        .map_err(|e| Error::RustError(format!("hash failed: {e}")))?;
    let t1 = now_ms();
    console_log!(
        "argon2 hash: {:.2}ms",
        (t1 - t0).max(0.0)
    );

    json_response(200, &HashResponse {
        hash: hash.to_string(),
    })
}

async fn handle_verify(mut req: Request, ctx: Context) -> Result<Response> {
    require_service_binding(&ctx)?;
    let body: VerifyRequest = match req.json().await {
        Ok(b) => b,
        Err(_) => return json_error(400, "invalid JSON body"),
    };
    if body.password.is_empty() || body.hash.is_empty() {
        return json_error(400, "missing password or hash");
    }

    let parsed_hash = match PasswordHash::new(&body.hash) {
        Ok(h) => h,
        Err(_) => return json_error(400, "invalid hash format"),
    };

    let t0 = now_ms();
    let valid = Argon2::default()
        .verify_password(body.password.as_bytes(), &parsed_hash)
        .is_ok();
    let t1 = now_ms();
    console_log!(
        "argon2 verify: {:.2}ms",
        (t1 - t0).max(0.0)
    );

    json_response(200, &VerifyResponse { valid })
}

#[event(fetch)]
async fn fetch(req: Request, _env: Env, ctx: Context) -> Result<Response> {
    let path = req.path();
    let method = req.method();

    match (method, path.as_str()) {
        (Method::Post, "/hash") => handle_hash(req, ctx).await,
        (Method::Post, "/verify") => handle_verify(req, ctx).await,
        (_, "/hash" | "/verify") => json_error(405, "method not allowed"),
        _ => json_error(404, "not found"),
    }
}
