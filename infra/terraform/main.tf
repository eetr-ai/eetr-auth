resource "cloudflare_d1_database" "auth" {
  account_id = var.account_id
  name       = var.d1_database_name
}

resource "cloudflare_r2_bucket" "auth_images" {
  account_id = var.account_id
  name       = var.r2_bucket_name
  location   = var.r2_location
}
