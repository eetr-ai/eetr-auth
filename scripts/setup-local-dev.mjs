#!/usr/bin/env node
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { calculateJwkThumbprint, exportJWK, importSPKI } from "jose";
import stripJsonComments from "strip-json-comments";
import { fileURLToPath } from "node:url";

// Run from apps/auth regardless of the caller's cwd — wrangler config, db/, infra/, and
// the sibling argon-hasher workspace all resolve relative to apps/auth.
process.chdir(fileURLToPath(new URL("../apps/auth", import.meta.url)));

const AUTH_PLACEHOLDER = "changeme-local-auth-secret";

const root = process.cwd();
const envLocalPath = join(root, ".env.local");
const devVarsPath = join(root, ".dev.vars");
const envExamplePath = join(root, ".env.example");
const devVarsExamplePath = join(root, ".dev.vars.example");
const tmpDir = join(root, ".tmp");
const jwksPath = join(tmpDir, "jwks.json");

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readText(filePath) {
	return existsSync(filePath) ? String(readFileSync(filePath, "utf8")) : "";
}

function ensureFromExample(targetPath, examplePath) {
	if (!existsSync(targetPath) && existsSync(examplePath)) {
		copyFileSync(examplePath, targetPath);
		console.log("Created", targetPath);
	}
}

function parseEnvValue(content, name) {
	const regex = new RegExp(`^${escapeRegExp(name)}=(.*)$`, "m");
	const match = content.match(regex);
	if (!match) return null;
	const raw = match[1].trim();
	if (!raw) return "";
	if (raw.startsWith('"') && raw.endsWith('"')) {
		try {
			return JSON.parse(raw);
		} catch {
			return raw.slice(1, -1);
		}
	}
	if (raw.startsWith("'") && raw.endsWith("'")) {
		return raw.slice(1, -1);
	}
	return raw;
}

function upsertLine(content, name, line) {
	const regex = new RegExp(`^${escapeRegExp(name)}=.*$`, "m");
	if (regex.test(content)) {
		return content.replace(regex, line);
	}
	if (!content.trim()) return `${line}\n`;
	return `${content.trimEnd()}\n${line}\n`;
}

function escapeQuoted(value) {
	return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
}

function plainLine(name, value) {
	return `${name}=${value}`;
}

function quotedLine(name, value) {
	return `${name}="${escapeQuoted(value)}"`;
}

function resolveSharedSecret(envLocal, devVars) {
	const candidates = [
		parseEnvValue(envLocal, "AUTH_SECRET"),
		parseEnvValue(envLocal, "NEXTAUTH_SECRET"),
		parseEnvValue(envLocal, "OAUTH_PENDING_SECRET"),
		parseEnvValue(devVars, "AUTH_SECRET"),
		parseEnvValue(devVars, "NEXTAUTH_SECRET"),
		parseEnvValue(devVars, "OAUTH_PENDING_SECRET"),
	].filter((value) => typeof value === "string" && value.trim().length > 0);

	const existing = candidates.find((value) => value !== AUTH_PLACEHOLDER);
	return existing ?? randomBytes(32).toString("hex");
}

function resolveHmacKey(envLocal, devVars) {
	const candidates = [parseEnvValue(envLocal, "HMAC_KEY"), parseEnvValue(devVars, "HMAC_KEY")].filter(
		(value) => typeof value === "string" && value.trim().length > 0
	);
	return candidates[0] ?? randomBytes(32).toString("hex");
}

async function resolveJwtMaterial(envLocal, devVars) {
	const jwtKid = parseEnvValue(envLocal, "JWT_KID") ?? parseEnvValue(devVars, "JWT_KID");
	const jwtPrivateKey =
		parseEnvValue(envLocal, "JWT_PRIVATE_KEY") ?? parseEnvValue(devVars, "JWT_PRIVATE_KEY");
	const jwtJwksJson =
		parseEnvValue(envLocal, "JWT_JWKS_JSON") ?? parseEnvValue(devVars, "JWT_JWKS_JSON");

	if (
		typeof jwtKid === "string" &&
		jwtKid.trim().length > 0 &&
		typeof jwtPrivateKey === "string" &&
		jwtPrivateKey.trim().length > 0 &&
		typeof jwtJwksJson === "string" &&
		jwtJwksJson.trim().length > 0
	) {
		return {
			kid: jwtKid.trim(),
			privateKey: jwtPrivateKey,
			jwksJson: jwtJwksJson,
			generated: false,
		};
	}

	const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
	const privatePem = privateKey.export({ type: "pkcs8", format: "pem" });
	const publicPem = publicKey.export({ type: "spki", format: "pem" });
	const publicJwk = await exportJWK(await importSPKI(publicPem, "RS256"));
	const kid = await calculateJwkThumbprint(publicJwk, "sha256");
	const jwksJson = JSON.stringify({
		keys: [{ ...publicJwk, alg: "RS256", use: "sig", kid }],
	});

	return {
		kid,
		privateKey: privatePem,
		jwksJson,
		generated: true,
	};
}

function resolveWranglerConfigPath() {
	// Local dev reads wrangler.generated.jsonc; fall back to the infra template.
	for (const candidate of [
		"wrangler.generated.jsonc",
		join("..", "..", "infra", "wrangler.template.jsonc"),
	]) {
		const path = resolve(root, candidate);
		if (existsSync(path)) return path;
	}
	return null;
}

/**
 * Upload the freshly-written JWKS to the LOCAL R2 bucket. The token service prefers
 * the `kid` from R2's jwks.json when signing, so if R2 holds a stale key the server
 * signs tokens with a kid the verifier (env JWKS) can't resolve — and /userinfo and
 * /token/validate reject every locally-issued token. Seeding R2 here keeps the signing
 * kid and the verification key in lockstep. Best-effort: warns (does not fail setup).
 */
function seedLocalR2Jwks(jwksFilePath) {
	const configPath = resolveWranglerConfigPath();
	if (!configPath) {
		console.warn(
			"Skipped local R2 JWKS seed: no wrangler config found (run npm run infra:render-wrangler)."
		);
		return;
	}
	let bucket;
	let jwksKey = "jwks.json";
	try {
		const config = JSON.parse(stripJsonComments(readFileSync(configPath, "utf8")));
		bucket = config?.r2_buckets?.[0]?.bucket_name;
		const keyVar = config?.vars?.JWKS_R2_KEY;
		if (typeof keyVar === "string" && keyVar.trim()) jwksKey = keyVar.trim();
	} catch (error) {
		console.warn(`Skipped local R2 JWKS seed: could not read ${configPath} (${error.message}).`);
		return;
	}
	if (typeof bucket !== "string" || !bucket.trim() || bucket.startsWith("REPLACE_WITH")) {
		console.warn("Skipped local R2 JWKS seed: R2 bucket is not configured in the wrangler config.");
		return;
	}
	try {
		execFileSync(
			"npx",
			[
				"wrangler",
				"r2",
				"object",
				"put",
				`${bucket.trim()}/${jwksKey}`,
				`--file=${jwksFilePath}`,
				"--content-type",
				"application/json",
				"--local",
			],
			{ cwd: root, stdio: ["ignore", "ignore", "inherit"] }
		);
		console.log(`Seeded local R2 ${bucket.trim()}/${jwksKey} from ${jwksFilePath}`);
	} catch (error) {
		console.warn(
			`Could not seed local R2 JWKS (${error.message}). Local token verification may fail until R2 holds this JWKS.`
		);
	}
}

async function main() {
	ensureFromExample(envLocalPath, envExamplePath);
	ensureFromExample(devVarsPath, devVarsExamplePath);

	let envLocal = readText(envLocalPath);
	let devVars = readText(devVarsPath);

	const sharedSecret = resolveSharedSecret(envLocal, devVars);
	const hmacKey = resolveHmacKey(envLocal, devVars);
	const jwt = await resolveJwtMaterial(envLocal, devVars);

	for (const [name, value] of [
		["AUTH_SECRET", sharedSecret],
		["NEXTAUTH_SECRET", sharedSecret],
		["OAUTH_PENDING_SECRET", sharedSecret],
		["HASH_METHOD", "md5"],
		["HMAC_KEY", hmacKey],
	]) {
		envLocal = upsertLine(envLocal, name, plainLine(name, value));
		devVars = upsertLine(devVars, name, plainLine(name, value));
	}

	for (const [name, value] of [
		["JWT_KID", jwt.kid],
		["JWT_PRIVATE_KEY", jwt.privateKey],
		["JWT_JWKS_JSON", jwt.jwksJson],
	]) {
		const line = name === "JWT_KID" ? plainLine(name, value) : quotedLine(name, value);
		envLocal = upsertLine(envLocal, name, line);
		devVars = upsertLine(devVars, name, line);
	}

	writeFileSync(envLocalPath, envLocal.endsWith("\n") ? envLocal : `${envLocal}\n`, "utf8");
	writeFileSync(devVarsPath, devVars.endsWith("\n") ? devVars : `${devVars}\n`, "utf8");

	if (!existsSync(tmpDir)) {
		mkdirSync(tmpDir, { recursive: true });
	}
	writeFileSync(jwksPath, JSON.stringify(JSON.parse(jwt.jwksJson), null, 2) + "\n", "utf8");

	console.log("Updated", envLocalPath);
	console.log("Updated", devVarsPath);
	console.log(jwt.generated ? "Generated" : "Reused", "local JWT signing material");
	console.log("Wrote", jwksPath);
	seedLocalR2Jwks(jwksPath);
	console.log("Local development env is ready.");
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});