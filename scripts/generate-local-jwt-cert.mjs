#!/usr/bin/env node
/**
 * Generate a local RSA key pair for testing JWT access tokens.
 * Writes JWT_PRIVATE_KEY to .env.local and saves jwks.json to .tmp/jwks.json
 * so you can upload to local R2 or use for verification.
 *
 * Usage: node scripts/generate-local-jwt-cert.mjs
 *
 * For local R2: after running, upload the JWKS so the auth app can verify tokens:
 *   npx wrangler r2 object put blog-images/jwks.json --file=.tmp/jwks.json --local
 */
import { generateKeyPairSync } from "node:crypto";
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { importSPKI, exportJWK, calculateJwkThumbprint } from "jose";

const tmpDir = join(process.cwd(), ".tmp");
const jwksPath = join(tmpDir, "jwks.json");
const envLocalPath = join(process.cwd(), ".env.local");

function escapeForEnv(pem) {
	return pem.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
}

async function main() {
	console.log("Generating local RSA key pair (RS256, 2048-bit)...");
	const { publicKey, privateKey } = generateKeyPairSync("rsa", {
		modulusLength: 2048,
	});

	const privatePem = privateKey.export({ type: "pkcs8", format: "pem" });
	const publicPem = publicKey.export({ type: "spki", format: "pem" });

	if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

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
	writeFileSync(jwksPath, JSON.stringify(jwks, null, 2), "utf8");
	console.log("Wrote", jwksPath);

	const line = `JWT_PRIVATE_KEY="${escapeForEnv(privatePem)}"`;
	const existing = existsSync(envLocalPath) ? String(readFileSync(envLocalPath, "utf8")) : "";
	let newContent;
	if (existing.includes("JWT_PRIVATE_KEY=")) {
		newContent = existing.replace(/^JWT_PRIVATE_KEY=.*$/m, line);
	} else if (existing.trim()) {
		newContent = existing.trimEnd() + "\n" + line + "\n";
	} else {
		newContent = line + "\n";
	}
	writeFileSync(envLocalPath, newContent, "utf8");
	console.log("Updated", envLocalPath, "with JWT_PRIVATE_KEY");

	console.log("\nTo use JWKS for local token verification (e.g. with wrangler dev):");
	console.log("  npx wrangler r2 object put blog-images/jwks.json --file=.tmp/jwks.json --local");
}

main().catch((err) => {
	console.error(err.message || err);
	process.exit(1);
});
