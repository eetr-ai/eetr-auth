#!/usr/bin/env node
/**
 * After Terraform apply + render-wrangler-config: generate AUTH_SECRET, HMAC_KEY,
 * JWT keypair + JWKS upload, optional RESEND_API_KEY — all via wrangler secret put.
 *
 * Requires wrangler login / CLOUDFLARE_API_TOKEN for Wrangler.
 *
 * Usage:
 *   node scripts/provision-env.mjs [--tf-json infra/out/terraform.tf.json] [--wrangler-config wrangler.generated.jsonc]
 *
 * RESEND_API_KEY: Terraform output resend_api_key if non-empty, else env RESEND_API_KEY / .env.provision (not loaded here).
 */
import { randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync, execFileSync } from "node:child_process";

function parseArgs(argv) {
	const out = {
		tfJson: "infra/out/terraform.tf.json",
		wranglerConfig: process.env.WRANGLER_CONFIG || "wrangler.generated.jsonc",
	};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--tf-json" && argv[i + 1]) {
			out.tfJson = argv[++i];
		} else if (a === "--wrangler-config" && argv[i + 1]) {
			out.wranglerConfig = argv[++i];
		}
	}
	return out;
}

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

function putSecret(name, value, configPath, cwd) {
	const cfg = JSON.stringify(configPath);
	execSync(`npx wrangler secret put ${name} --config ${cfg}`, {
		input: value,
		stdio: ["pipe", "inherit", "inherit"],
		cwd,
	});
}

function main() {
	const args = parseArgs(process.argv.slice(2));
	const root = process.cwd();
	const tfPath = resolve(root, args.tfJson);
	const configPath = resolve(root, args.wranglerConfig);

	if (!existsSync(tfPath)) {
		console.error("Missing Terraform output JSON:", tfPath);
		console.error("Run: npm run infra:terraform-output (after terraform apply)");
		process.exit(1);
	}
	if (!existsSync(configPath)) {
		console.error("Missing Wrangler config:", configPath);
		console.error("Run: npm run infra:render-wrangler");
		process.exit(1);
	}

	const tf = unwrapTerraformOutput(JSON.parse(readFileSync(tfPath, "utf8")));

	const authSecret = randomBytes(32).toString("base64");
	const hmacKey = randomBytes(32).toString("hex");

	console.log("Uploading AUTH_SECRET...");
	putSecret("AUTH_SECRET", authSecret, configPath, root);
	console.log("Uploading HMAC_KEY...");
	putSecret("HMAC_KEY", hmacKey, configPath, root);

	const bucket = typeof tf.r2_bucket_name === "string" ? tf.r2_bucket_name : "";
	if (!bucket) {
		throw new Error("terraform output r2_bucket_name is missing.");
	}

	const resendFromTf = typeof tf.resend_api_key === "string" ? tf.resend_api_key.trim() : "";
	const resendFromEnv = (process.env.RESEND_API_KEY ?? "").trim();
	const resend = resendFromTf || resendFromEnv;
	if (resend) {
		console.log("Uploading RESEND_API_KEY...");
		putSecret("RESEND_API_KEY", resend, configPath, root);
	} else {
		console.log("Skipping RESEND_API_KEY (set resend_api_key in tfvars or RESEND_API_KEY in env).");
	}

	console.log("Running JWT + JWKS upload (setup-jwt-secrets)...");
	execFileSync(
		process.execPath,
		["scripts/setup-jwt-secrets.mjs", "--config", args.wranglerConfig, "--bucket", bucket],
		{ stdio: "inherit", cwd: root }
	);

	console.log("Done.");
}

main();
