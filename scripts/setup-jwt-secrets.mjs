#!/usr/bin/env node
/**
 * Generate RSA key pair for JWT (RS256), store private key as Wrangler secret,
 * and upload JWKS to the blog-images R2 bucket (served at https://cdn.progression-ai.com/jwks.json).
 *
 * Usage: node scripts/setup-jwt-secrets.mjs [--env <environment>]
 * Run per environment; use the same key pair for that environment.
 * Requires: wrangler in PATH, and R2 bucket "blog-images" to exist.
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
	execSync(`npx wrangler secret put JWT_PRIVATE_KEY ${envFlag}`.trim(), {
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

	try {
		console.log("Uploading JWKS to R2 (blog-images/jwks.json, remote)...");
		execSync(
			`npx wrangler r2 object put blog-images/jwks.json --file=${jwksPath} --remote ${envFlag}`.trim(),
			{ stdio: "inherit", cwd: process.cwd() }
		);
		console.log("Done. JWKS is available at https://cdn.progression-ai.com/jwks.json");
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
