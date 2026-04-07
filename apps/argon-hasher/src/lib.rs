//! Cloudflare Worker: Argon2id hash and verify API (internal service binding + ctx.props).

mod core;

use serde::{Deserialize, Serialize};
use worker::*;

/// Deserialize-only: the **caller** Worker must set matching `[[services]]` `props` in its Wrangler config.
#[derive(Deserialize)]
struct ServiceBindingProps {
    /// Must be `true` on the binding for this Worker to accept the request.
    internal: bool,
}

/// Returns `Err(Response)` with status 403 when the invocation is not from a configured service binding with `internal = true`.
fn require_service_binding(ctx: &Context) -> std::result::Result<(), Response> {
    let props = match ctx.props::<ServiceBindingProps>() {
        Ok(p) => p,
        Err(_) => return Err(json_error(403, "forbidden").unwrap()),
    };
    if !props.internal {
        return Err(json_error(403, "forbidden").unwrap());
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
    if let Err(resp) = require_service_binding(&ctx) {
        return Ok(resp);
    }
    let body: HashRequest = match req.json().await {
        Ok(b) => b,
        Err(_) => return json_error(400, "invalid JSON body"),
    };
    if body.password.is_empty() {
        return json_error(400, "missing or empty password");
    }

    let t0 = now_ms();
    let hash = core::hash_password(&body.password).map_err(Error::RustError)?;
    let t1 = now_ms();
    console_log!("argon2 hash: {:.2}ms", (t1 - t0).max(0.0));

    json_response(
        200,
        &HashResponse {
            hash,
        },
    )
}

async fn handle_verify(mut req: Request, ctx: Context) -> Result<Response> {
    if let Err(resp) = require_service_binding(&ctx) {
        return Ok(resp);
    }
    let body: VerifyRequest = match req.json().await {
        Ok(b) => b,
        Err(_) => return json_error(400, "invalid JSON body"),
    };
    if body.password.is_empty() || body.hash.is_empty() {
        return json_error(400, "missing password or hash");
    }

    let t0 = now_ms();
    let valid = match core::verify_password(&body.password, &body.hash) {
		Ok(valid) => valid,
		Err(err) if err == "invalid hash format" => return json_error(400, "invalid hash format"),
		Err(err) => return Err(Error::RustError(err)),
	};
    let t1 = now_ms();
    console_log!("argon2 verify: {:.2}ms", (t1 - t0).max(0.0));

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
