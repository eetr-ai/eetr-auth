variable "account_id" {
  description = "Cloudflare account ID (32-char hex)."
  type        = string
}

variable "d1_database_name" {
  description = "D1 database name (must match wrangler DB binding database_name)."
  type        = string
}

variable "r2_bucket_name" {
  description = "R2 bucket name for BLOG_IMAGES (e.g. blog-images)."
  type        = string
}

variable "worker_name" {
  description = "Worker name used at deploy time; must match top-level wrangler name and WORKER_SELF_REFERENCE.service."
  type        = string
}

variable "issuer_base_url" {
  description = "ISSUER_BASE_URL (no trailing slash)."
  type        = string
}

variable "auth_url" {
  description = "AUTH_URL — full session URL, e.g. https://auth.example.com/api/auth/session"
  type        = string
}

variable "jwks_cdn_base_url" {
  description = "JWKS_CDN_BASE_URL — public base URL serving jwks.json (no trailing slash)."
  type        = string
}

variable "resend_api_key" {
  description = "Optional Resend API key; passed to provision script for wrangler secret put (sensitive)."
  type        = string
  sensitive   = true
  default     = ""
}

variable "r2_location" {
  description = "Optional R2 location hint (e.g. WEUR)."
  type        = string
  default     = null
}
