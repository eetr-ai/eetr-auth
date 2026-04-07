#!/usr/bin/env node
/**
 * Create an admin user in local and/or remote D1.
 *
 * The inserted password hash is a random placeholder that cannot be used to sign in.
 * Complete account setup via the password reset flow.
 *
 * Usage: node scripts/create-admin.mjs <username> <email>
 *    or: ADMIN_USERNAME=x ADMIN_EMAIL=y node scripts/create-admin.mjs
 *    or: USER_USERNAME=x USER_EMAIL=y node scripts/create-admin.mjs
 * Options: --local-only | --remote-only | --config <wrangler-config> | --username <u> | --email <e>
 * Env: WRANGLER_CONFIG (used when --config is not provided)
 */
import { randomUUID, randomBytes } from "node:crypto";
import { writeFileSync, unlinkSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import stripJsonComments from "strip-json-comments";

const args = process.argv.slice(2);
let localOnly = false;
let remoteOnly = false;
let wranglerConfig = process.env.WRANGLER_CONFIG?.trim() || "";
let usernameFlag = "";
let emailFlag = "";
const filteredArgs = [];

for (let i = 0; i < args.length; i++) {
	const a = args[i];
	if (a === "--local-only") {
		localOnly = true;
		continue;
	}
	if (a === "--remote-only") {
		remoteOnly = true;
		continue;
	}
	if (a === "--config" && args[i + 1]) {
		wranglerConfig = args[++i];
		continue;
	}
	if (a.startsWith("--config=")) {
		wranglerConfig = a.slice("--config=".length);
		continue;
	}
	if (a === "--username" && args[i + 1]) {
		usernameFlag = args[++i];
		continue;
	}
	if (a.startsWith("--username=")) {
		usernameFlag = a.slice("--username=".length);
		continue;
	}
	if (a === "--email" && args[i + 1]) {
		emailFlag = args[++i];
		continue;
	}
	if (a.startsWith("--email=")) {
		emailFlag = a.slice("--email=".length);
		continue;
	}
	filteredArgs.push(a);
}

// Backward-compatible positional config support:
// node scripts/create-admin.mjs --remote-only wrangler.generated.jsonc user pass
if (!wranglerConfig && filteredArgs.length >= 3 && /wrangler.*\.jsonc?$/i.test(filteredArgs[0])) {
	wranglerConfig = filteredArgs.shift() || "";
}

if (!localOnly && !wranglerConfig) {
	wranglerConfig = "wrangler.generated.jsonc";
}

let configDbName = "";

if (wranglerConfig) {
	try {
		const cfgRaw = readFileSync(wranglerConfig, "utf8");
		const cfg = JSON.parse(stripJsonComments(cfgRaw));
		if (Array.isArray(cfg?.d1_databases) && cfg.d1_databases[0]) {
			const fromConfig = cfg.d1_databases[0].database_name;
			if (typeof fromConfig === "string" && fromConfig.trim()) {
				configDbName = fromConfig.trim();
			}
		}
	} catch (err) {
		console.warn(
			`Warning: could not read Wrangler config ${wranglerConfig}: ${(err && err.message) || err}`
		);
	}
}

const username =
	usernameFlag || filteredArgs[0] || process.env.ADMIN_USERNAME || process.env.USER_USERNAME || "";
const email = (emailFlag || filteredArgs[1] || process.env.ADMIN_EMAIL || process.env.USER_EMAIL || "")
	.trim()
	.toLowerCase();

if (!username.trim() || !email) {
	console.error(
		"Usage: node scripts/create-admin.mjs <username> <email>\n" +
			"   or: ADMIN_USERNAME=x ADMIN_EMAIL=y node scripts/create-admin.mjs\n" +
			"   or: USER_USERNAME=x USER_EMAIL=y node scripts/create-admin.mjs\n" +
			"Options: --local-only | --remote-only | --config <wrangler-config> | --username <u> | --email <e>"
	);
	process.exit(1);
}

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
	console.error("Invalid email format.");
	process.exit(1);
}

function escapeSql(value) {
	return String(value).replace(/'/g, "''");
}

const id = randomUUID();
const passwordHash = `reset-required:${randomBytes(32).toString("hex")}`;
const emailVerifiedAt = new Date().toISOString();
const escapedUsername = escapeSql(username.trim());
const escapedEmail = escapeSql(email);
const escapedEmailVerifiedAt = escapeSql(emailVerifiedAt);
const escapedHash = escapeSql(passwordHash);

const sql = `INSERT INTO users (id, username, email, email_verified_at, password_hash, is_admin) VALUES ('${id}', '${escapedUsername}', '${escapedEmail}', '${escapedEmailVerifiedAt}', '${escapedHash}', 1);`;

const tmpDir = join(process.cwd(), ".tmp");
const sqlPath = join(tmpDir, `create-admin-${Date.now()}.sql`);

try {
	if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
	writeFileSync(sqlPath, sql, "utf8");

	const dbName = process.env.D1_DATABASE_NAME || configDbName || (remoteOnly ? "" : "eetr-auth");
	if (!localOnly && !dbName) {
		console.error(
			"Remote admin creation requires wrangler.generated.jsonc, --config <path>, or D1_DATABASE_NAME. Run npm run infra:render-wrangler first."
		);
		process.exit(1);
	}
	const configArg = wranglerConfig ? ` --config ${JSON.stringify(wranglerConfig)}` : "";
	if (wranglerConfig) {
		console.log(`Using Wrangler config: ${wranglerConfig}`);
	}
	if (!process.env.D1_DATABASE_NAME && configDbName) {
		console.log(`Using D1 database_name from config: ${configDbName}`);
	}
	const run = (target) => {
		const flag = target === "local" ? "--local" : "--remote";
		execSync(
			`npx wrangler d1 execute ${JSON.stringify(dbName)} ${flag}${configArg} --file=${JSON.stringify(sqlPath)}`,
			{
				stdio: "inherit",
				cwd: process.cwd(),
			}
		);
	};

	if (!remoteOnly) {
		console.log("Creating admin in local D1...");
		run("local");
		console.log("Local: done.");
	}
	if (!localOnly) {
		console.log("Creating admin in remote D1...");
		run("remote");
		console.log("Remote: done.");
	}

	console.log(`Admin "${username}" created (id: ${id}, email: ${email}).`);
	console.log("A random placeholder password was stored. Complete setup via the password reset flow.");
} catch (err) {
	console.error(err.message || err);
	process.exit(1);
} finally {
	try {
		unlinkSync(sqlPath);
	} catch {
		// ignore
	}
}
