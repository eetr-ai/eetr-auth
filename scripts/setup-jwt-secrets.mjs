#!/usr/bin/env node
/**
 * Generate RSA key pair for JWT (RS256), store private key as Wrangler secret,
 * and upload JWKS to the R2 bucket (public URL from JWKS_CDN_BASE_URL / jwks.json).
 *
 * Usage: node scripts/setup-jwt-secrets.mjs [--env <environment>] [--config <wrangler.jsonc>] [--bucket <name>] [--jwks-key <object-key>]
 * Bucket defaults to R2_BUCKET_NAME env or "blog-images". Object key defaults to "jwks.json".
 * Run per environment; use the same key pair for that environment.
 */
import { generateKeyPairSync } from "node:crypto";
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { importSPKI, exportJWK, calculateJwkThumbprint } from "jose";

const args = process.argv.slice(2);
const envIndex = args.indexOf("--env");
const wranglerEnv = envIndex >= 0 && args[envIndex + 1] ? args[envIndex + 1] : null;
const envFlag = wranglerEnv ? `--env ${wranglerEnv}` : "";

const configIndex = args.indexOf("--config");
const wranglerConfig =
	configIndex >= 0 && args[configIndex + 1] ? args[configIndex + 1] : "wrangler.jsonc";
const configFlag = ` --config ${JSON.stringify(wranglerConfig)}`;

const bucketIndex = args.indexOf("--bucket");
const r2Bucket =
	(bucketIndex >= 0 && args[bucketIndex + 1] ? args[bucketIndex + 1] : null) ??
	process.env.R2_BUCKET_NAME ??
	"blog-images";

const jwksKeyIndex = args.indexOf("--jwks-key");
const jwksKey =
	(jwksKeyIndex >= 0 && args[jwksKeyIndex + 1] ? args[jwksKeyIndex + 1] : null) ?? "jwks.json";

const tmpDir = join(process.cwd(), ".tmp");
const jwksPath = join(tmpDir, `jwks-${Date.now()}.json`);

async function main() {
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
