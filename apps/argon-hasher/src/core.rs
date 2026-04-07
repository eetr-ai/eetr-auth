use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::{Algorithm, Argon2, Params, Version};
use rand_core::OsRng;

/// Tuned for Cloudflare Workers CPU/memory limits.
pub const M_COST_KIB: u32 = 19_456;
pub const T_COST: u32 = 3;
pub const P_COST: u32 = 1;
/// PHC output length (bytes), matches the worker implementation.
pub const HASH_OUTPUT_LEN: usize = 32;

pub fn configured_argon2() -> Result<Argon2<'static>, String> {
	let params = Params::new(M_COST_KIB, T_COST, P_COST, Some(HASH_OUTPUT_LEN))
		.map_err(|err| format!("argon2 params: {err}"))?;
	Ok(Argon2::new(Algorithm::Argon2id, Version::V0x13, params))
}

pub fn hash_password(password: &str) -> Result<String, String> {
	if password.is_empty() {
		return Err("password must not be empty".to_string());
	}
	let argon2 = configured_argon2()?;
	let salt = SaltString::generate(&mut OsRng);
	let hash = argon2
		.hash_password(password.as_bytes(), &salt)
		.map_err(|err| format!("hash failed: {err}"))?;
	Ok(hash.to_string())
}

pub fn verify_password(password: &str, hash: &str) -> Result<bool, String> {
	if password.is_empty() {
		return Err("password must not be empty".to_string());
	}
	if hash.is_empty() {
		return Err("hash must not be empty".to_string());
	}
	let parsed = PasswordHash::new(hash).map_err(|_| "invalid hash format".to_string())?;
	Ok(Argon2::default().verify_password(password.as_bytes(), &parsed).is_ok())
}