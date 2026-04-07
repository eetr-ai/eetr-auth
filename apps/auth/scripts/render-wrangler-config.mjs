#!/usr/bin/env node
/**
 * Merge the template Wrangler config with terraform output JSON (infra/out/terraform.tf.json).
 *
 * Usage:
 *   terraform -chdir=infra/terraform output -json > infra/out/terraform.tf.json
 *   node scripts/render-wrangler-config.mjs [--base infra/wrangler.template.jsonc] [--tf-json path] [--out wrangler.generated.jsonc]
 *
 * Optional overrides (non-empty wins over Terraform): --issuer-base-url, --auth-url, --jwks-cdn-base-url
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import stripJsonComments from "strip-json-comments";

function parseArgs(argv) {
	const out = {
		base: "infra/wrangler.template.jsonc",
		tfJson: null,
		outFile: "wrangler.generated.jsonc",
		issuerBaseUrl: "",
		authUrl: "",
		jwksCdnBaseUrl: "",
	};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--base" && argv[i + 1]) {
			out.base = argv[++i];
		} else if (a === "--tf-json" && argv[i + 1]) {
			out.tfJson = argv[++i];
		} else if (a === "--out" && argv[i + 1]) {
			out.outFile = argv[++i];
		} else if (a === "--issuer-base-url" && argv[i + 1]) {
			out.issuerBaseUrl = argv[++i];
		} else if (a === "--auth-url" && argv[i + 1]) {
			out.authUrl = argv[++i];
		} else if (a === "--jwks-cdn-base-url" && argv[i + 1]) {
			out.jwksCdnBaseUrl = argv[++i];
		}
	}
	return out;
}

/** Terraform CLI wraps each output in { value, sensitive, type }. */
function unwrapTerraformOutput(raw) {
	const out = {};
	for (const [k, v] of Object.entries(raw)) {
		if (v && typeof v === "object" && "value" in v) {
			out[k] = v.value;
		} else {
			out[k] = v;
		}
	}
	return out;
}

function readTfJson(pathOrStdin) {
	if (pathOrStdin === "-") {
		return unwrapTerraformOutput(JSON.parse(readFileSync(0, "utf8")));
	}
	const text = readFileSync(pathOrStdin, "utf8");
	return unwrapTerraformOutput(JSON.parse(text));
}

function main() {
	const args = parseArgs(process.argv.slice(2));
	const root = process.cwd();
	const basePath = resolve(root, args.base);
	const tfPath = args.tfJson ? resolve(root, args.tfJson) : null;

	if (!tfPath) {
		console.error("Missing --tf-json <path> (or use stdin with - if implemented).");
		console.error("Example: terraform -chdir=infra/terraform output -json > infra/out/terraform.tf.json");
		console.error("         node scripts/render-wrangler-config.mjs --tf-json infra/out/terraform.tf.json");
		process.exit(1);
	}

	const baseText = readFileSync(basePath, "utf8");
	const config = JSON.parse(stripJsonComments(baseText));
	const tf = readTfJson(tfPath);

	const workerName = tf.worker_name;
	if (typeof workerName !== "string" || !workerName.trim()) {
		throw new Error("terraform output worker_name is missing or empty.");
	}
	config.name = workerName.trim();

	if (Array.isArray(config.services)) {
		for (const s of config.services) {
			if (s && s.binding === "WORKER_SELF_REFERENCE") {
				s.service = workerName.trim();
			}
		}
	}

	if (!config.d1_databases?.[0]) {
		throw new Error("Base config must define d1_databases[0].");
	}
	config.d1_databases[0].database_id = tf.d1_database_id;
	config.d1_databases[0].database_name = tf.d1_database_name;

	if (!config.r2_buckets?.[0]) {
		throw new Error("Base config must define r2_buckets[0].");
	}
	config.r2_buckets[0].bucket_name = tf.r2_bucket_name;

	if (!config.vars) {
		config.vars = {};
	}
	const issuer = args.issuerBaseUrl.trim() || tf.issuer_base_url;
	const auth = args.authUrl.trim() || tf.auth_url;
	const jwksCdn = args.jwksCdnBaseUrl.trim() || tf.jwks_cdn_base_url;
	if (typeof issuer !== "string" || !issuer) {
		throw new Error("issuer_base_url missing (Terraform or --issuer-base-url).");
	}
	if (typeof auth !== "string" || !auth) {
		throw new Error("auth_url missing (Terraform or --auth-url).");
	}
	if (typeof jwksCdn !== "string" || !jwksCdn) {
		throw new Error("jwks_cdn_base_url missing (Terraform or --jwks-cdn-base-url).");
	}
	config.vars.ISSUER_BASE_URL = issuer;
	config.vars.AUTH_URL = auth;
	config.vars.JWKS_CDN_BASE_URL = jwksCdn;

	const outPath = resolve(root, args.outFile);
	writeFileSync(outPath, JSON.stringify(config, null, "\t") + "\n", "utf8");
	console.log("Wrote", outPath);
}

main();
