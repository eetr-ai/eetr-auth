#!/usr/bin/env node
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { calculateJwkThumbprint, exportJWK, importSPKI } from "jose";

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
	console.log("Local development env is ready.");
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});