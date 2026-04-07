use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::{Algorithm, Argon2, Params, Version};
use rand_core::OsRng;

#[cfg(test)]
const SEEDED_ADMIN_HASH: &str = "$argon2id$v=19$m=19456,t=3,p=1$5TIfE1Imf5CSupfO5v0x4Q$pUgZNbxjX7XRTr/he0pqQ0NWmcDWsUu6al6LGpcd2Qk";

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
	let argon2 = configured_argon2()?;
	Ok(argon2.verify_password(password.as_bytes(), &parsed).is_ok())
}

#[cfg(test)]
mod tests {
	use super::*;

	// --- configured_argon2 ---

	#[test]
	fn configured_argon2_builds_successfully() {
		assert!(configured_argon2().is_ok());
	}

	// --- hash_password ---

	#[test]
	fn hash_password_returns_phc_string() {
		let hash = hash_password("secret").unwrap();
		// PHC strings start with "$argon2id$"
		assert!(hash.starts_with("$argon2id$"), "unexpected hash prefix: {hash}");
	}

	#[test]
	fn hash_password_produces_unique_hashes() {
		let h1 = hash_password("secret").unwrap();
		let h2 = hash_password("secret").unwrap();
		assert_ne!(h1, h2, "two hashes of the same password must differ (random salt)");
	}

	#[test]
	fn hash_password_rejects_empty_password() {
		let err = hash_password("").unwrap_err();
		assert_eq!(err, "password must not be empty");
	}

	// --- verify_password ---

	#[test]
	fn verify_password_accepts_correct_password() {
		let hash = hash_password("correct-horse").unwrap();
		assert!(verify_password("correct-horse", &hash).unwrap());
	}

	#[test]
	fn verify_password_accepts_seeded_admin_hash() {
		assert!(verify_password("admin", SEEDED_ADMIN_HASH).unwrap());
	}

	#[test]
	fn verify_password_rejects_wrong_password() {
		let hash = hash_password("correct-horse").unwrap();
		assert!(!verify_password("wrong-horse", &hash).unwrap());
	}

	#[test]
	fn verify_password_rejects_empty_password() {
		let hash = hash_password("some-password").unwrap();
		let err = verify_password("", &hash).unwrap_err();
		assert_eq!(err, "password must not be empty");
	}

	#[test]
	fn verify_password_rejects_empty_hash() {
		let err = verify_password("some-password", "").unwrap_err();
		assert_eq!(err, "hash must not be empty");
	}

	#[test]
	fn verify_password_rejects_malformed_hash() {
		let err = verify_password("some-password", "not-a-valid-phc-hash").unwrap_err();
		assert_eq!(err, "invalid hash format");
	}
}