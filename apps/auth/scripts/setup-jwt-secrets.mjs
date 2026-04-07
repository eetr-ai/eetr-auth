#!/usr/bin/env node
/**
 * Generate RSA key pair for JWT (RS256), store private key as Wrangler secret,
 * and upload JWKS to the configured R2 bucket.
 *
 * Usage: node scripts/setup-jwt-secrets.mjs [--env <environment>] [--config <wrangler.generated.jsonc>] [--bucket <name>] [--jwks-key <object-key>]
 * Remote runs default to WRANGLER_CONFIG or wrangler.generated.jsonc. Bucket defaults to the first r2_buckets entry in the Wrangler config.
 * Run per environment; use the same key pair for that environment.
 */
import { generateKeyPairSync } from "node:crypto";
import { writeFileSync, unlinkSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";
import { importSPKI, exportJWK, calculateJwkThumbprint } from "jose";
import stripJsonComments from "strip-json-comments";

const args = process.argv.slice(2);
const envIndex = args.indexOf("--env");
const wranglerEnv = envIndex >= 0 && args[envIndex + 1] ? args[envIndex + 1] : null;
const envFlag = wranglerEnv ? `--env ${wranglerEnv}` : "";

const configIndex = args.indexOf("--config");
const wranglerConfig =
	configIndex >= 0 && args[configIndex + 1]
		? args[configIndex + 1]
		: process.env.WRANGLER_CONFIG?.trim() || "wrangler.generated.jsonc";
const configFlag = ` --config ${JSON.stringify(wranglerConfig)}`;

const bucketIndex = args.indexOf("--bucket");
const r2BucketArg = bucketIndex >= 0 && args[bucketIndex + 1] ? args[bucketIndex + 1] : null;

const jwksKeyIndex = args.indexOf("--jwks-key");
const jwksKey =
	(jwksKeyIndex >= 0 && args[jwksKeyIndex + 1] ? args[jwksKeyIndex + 1] : null) ?? "jwks.json";

const tmpDir = join(process.cwd(), ".tmp");
const jwksPath = join(tmpDir, `jwks-${Date.now()}.json`);

function loadWranglerConfig(configPath) {
	const resolvedPath = resolve(process.cwd(), configPath);
	if (!existsSync(resolvedPath)) {
		throw new Error(
			`Missing Wrangler config: ${resolvedPath}. Run npm run infra:render-wrangler or pass --config <path>.`
		);
	}

	return JSON.parse(stripJsonComments(readFileSync(resolvedPath, "utf8")));
}

function resolveR2Bucket(config) {
	const bucketName = config?.r2_buckets?.[0]?.bucket_name;
	if (typeof bucketName === "string" && bucketName.trim()) {
		return bucketName.trim();
	}

	throw new Error(
		"R2 bucket is not configured. Pass --bucket <name> or ensure wrangler.generated.jsonc defines r2_buckets[0].bucket_name."
	);
}

async function main() {
	const config = loadWranglerConfig(wranglerConfig);
	const r2Bucket = r2BucketArg?.trim() || resolveR2Bucket(config);

	console.log("Generating RSA key pair (RS256, 2048-bit)...");
	const { publicKey, privateKey } = generateKeyPairSync("rsa", {
		modulusLength: 2048,
	});

	const privatePem = privateKey.export({ type: "pkcs8", format: "pem" });
	const publicPem = publicKey.export({ type: "spki", format: "pem" });

	console.log("Storing JWT_PRIVATE_KEY secret in Wrangler...");
	execSync(`npx wrangler secret put JWT_PRIVATE_KEY${configFlag} ${envFlag}`.trim(), {
		input: privatePem,
		stdio: ["pipe", "inherit", "inherit"],
		cwd: process.cwd(),
	});

	console.log("Building JWKS from public key...");
	const key = await importSPKI(publicPem, "RS256");
	const jwk = await exportJWK(key);
	const thumbprint = await calculateJwkThumbprint(jwk, "sha256");
	const jwks = {
		keys: [
			{
				...jwk,
				alg: "RS256",
				use: "sig",
				kid: thumbprint,
			},
		],
	};

	if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
	writeFileSync(jwksPath, JSON.stringify(jwks, null, 2), "utf8");

	const r2Path = `${r2Bucket}/${jwksKey}`;
	try {
		console.log(`Uploading JWKS to R2 (${r2Path}, remote)...`);
		execSync(
			`npx wrangler r2 object put ${r2Path} --file=${jwksPath} --remote${configFlag} ${envFlag}`.trim(),
			{ stdio: "inherit", cwd: process.cwd() }
		);
		console.log(`Done. Ensure JWKS is publicly available at your JWKS_CDN_BASE_URL (e.g. .../${jwksKey}).`);
	} finally {
		try {
			unlinkSync(jwksPath);
		} catch {
			// ignore
		}
	}
}

main().catch((err) => {
	console.error(err.message || err);
	process.exit(1);
});
