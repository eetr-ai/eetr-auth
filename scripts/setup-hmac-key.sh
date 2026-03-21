#!/usr/bin/env bash
# Generate two independent HMAC_KEY values with OpenSSL:
# - Key 1 → written into .env.local (Next.js / local tooling via sed)
# - Key 2 → print a wrangler one-liner to upload as the Worker secret on Cloudflare
#
# Usage: from repo root, `bash scripts/setup-hmac-key.sh`
# Requires: openssl, sed; for Cloudflare: `npx wrangler login` once

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_LOCAL="${ROOT}/.env.local"

LOCAL_KEY="$(openssl rand -hex 32)"
CLOUD_KEY="$(openssl rand -hex 32)"

replace_or_append_hmac() {
	local file="$1"
	local key="$2"
	if [[ -f "$file" ]] && grep -q '^HMAC_KEY=' "$file" 2>/dev/null; then
		if [[ "$(uname -s)" == "Darwin" ]]; then
			sed -i '' "s/^HMAC_KEY=.*/HMAC_KEY=${key}/" "$file"
		else
			sed -i "s/^HMAC_KEY=.*/HMAC_KEY=${key}/" "$file"
		fi
	else
		if [[ -f "$file" ]] && [[ -s "$file" ]]; then
			printf '\n' >>"$file"
		fi
		printf 'HMAC_KEY=%s\n' "$key" >>"$file"
	fi
}

replace_or_append_hmac "$ENV_LOCAL" "$LOCAL_KEY"

echo "Updated ${ENV_LOCAL} with HMAC_KEY (64 hex chars, local dev)."
echo "If you use Wrangler-only local runs, copy the same line into .dev.vars or symlink."
echo ""
echo "Cloudflare Worker secret (production): the second key is NOT in any file."
echo "Run this in a private terminal (it embeds the secret once):"
echo ""
echo "  echo '${CLOUD_KEY}' | npx wrangler secret put HMAC_KEY"
echo ""
echo "To target a named environment (if you use one):"
echo "  echo '${CLOUD_KEY}' | npx wrangler secret put HMAC_KEY --env <name>"
echo ""
echo "Note: local and remote keys differ on purpose (separate DBs / isolation)."
