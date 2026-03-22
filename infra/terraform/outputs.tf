output "account_id" {
  description = "Echo of var.account_id for convenience."
  value       = var.account_id
}

output "d1_database_id" {
  description = "D1 database UUID for wrangler database_id."
  value       = cloudflare_d1_database.auth.id
}

output "d1_database_name" {
  value = var.d1_database_name
}

output "r2_bucket_name" {
  value = var.r2_bucket_name
}

output "worker_name" {
  value = var.worker_name
}

output "issuer_base_url" {
  value = var.issuer_base_url
}

output "auth_url" {
  value = var.auth_url
}

output "jwks_cdn_base_url" {
  value = var.jwks_cdn_base_url
}

output "resend_api_key" {
  description = "Passthrough for provision script; empty if not set in tfvars."
  value       = var.resend_api_key
  sensitive   = true
}
