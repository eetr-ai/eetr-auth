#!/usr/bin/env node
/**
 * Generate a local RSA key pair for testing JWT access tokens.
 * Writes JWT_PRIVATE_KEY, JWT_KID, and JWT_JWKS_JSON to .env.local so that
 * next dev uses the same key for signing and verification (R2 in next dev is
 * a different store than wrangler --local). Also writes .tmp/jwks.json.
 *
 * Usage: node scripts/generate-local-jwt-cert.mjs
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

	const jwksJsonMinified = JSON.stringify(jwks);
	const jwksJsonEscaped = jwksJsonMinified.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

	const kidLine = `JWT_KID="${thumbprint}"`;
	const keyLine = `JWT_PRIVATE_KEY="${escapeForEnv(privatePem)}"`;
	const jwksJsonLine = `JWT_JWKS_JSON="${jwksJsonEscaped}"`;
	const existing = existsSync(envLocalPath) ? String(readFileSync(envLocalPath, "utf8")) : "";
	let content = existing;

	const updateVar = (name, line) => {
		const regex = new RegExp(`^${name}=.*$`, "m");
		if (content.includes(name + "=")) {
			content = content.replace(regex, line);
		} else if (content.trim()) {
			content = content.trimEnd() + "\n" + line + "\n";
		} else {
			content = line + "\n";
		}
	};
	updateVar("JWT_KID", kidLine);
	updateVar("JWT_PRIVATE_KEY", keyLine);
	updateVar("JWT_JWKS_JSON", jwksJsonLine);
	writeFileSync(envLocalPath, content.endsWith("\n") ? content : content + "\n", "utf8");
	console.log("Updated", envLocalPath, "with JWT_KID, JWT_PRIVATE_KEY, and JWT_JWKS_JSON");

	console.log("\nFor wrangler dev/preview (uses R2): upload JWKS to local R2:");
	console.log("  npx wrangler r2 object put <your-r2-bucket>/jwks.json --file=.tmp/jwks.json --local");
}

main().catch((err) => {
	console.error(err.message || err);
	process.exit(1);
});
