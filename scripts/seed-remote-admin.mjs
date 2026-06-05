#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import stripJsonComments from "strip-json-comments";

const args = process.argv.slice(2);
let wranglerConfig = process.env.WRANGLER_CONFIG?.trim() || "wrangler.generated.jsonc";
let email = (process.env.ADMIN_EMAIL || "admin@example.com").trim().toLowerCase();

for (let i = 0; i < args.length; i++) {
	const arg = args[i];
	if (arg === "--config" && args[i + 1]) {
		wranglerConfig = args[++i];
		continue;
	}
	if (arg.startsWith("--config=")) {
		wranglerConfig = arg.slice("--config=".length);
		continue;
	}
	if (arg === "--email" && args[i + 1]) {
		email = args[++i].trim().toLowerCase();
		continue;
	}
	if (arg.startsWith("--email=")) {
		email = arg.slice("--email=".length).trim().toLowerCase();
	}
	if (arg === "--help" || arg === "-h") {
		console.log(
			"Usage: node scripts/seed-remote-admin.mjs [--config wrangler.generated.jsonc] [--email admin@example.com]"
		);
		process.exit(0);
	}
}

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
	console.error("Invalid email format.");
	process.exit(1);
}

function escapeSql(value) {
	return String(value).replace(/'/g, "''");
}

function resolveDatabaseName(configPath) {
	try {
		const raw = readFileSync(configPath, "utf8");
		const config = JSON.parse(stripJsonComments(raw));
		const databaseName = config?.d1_databases?.[0]?.database_name;
		if (typeof databaseName === "string" && databaseName.trim()) {
			return databaseName.trim();
		}
	} catch (error) {
		console.error(
			`Could not read Wrangler config ${configPath}: ${(error && error.message) || error}`
		);
		process.exit(1);
	}

	console.error(`Wrangler config ${configPath} does not define d1_databases[0].database_name.`);
	process.exit(1);
}

const configPath = resolve(process.cwd(), wranglerConfig);
const dbName = process.env.D1_DATABASE_NAME?.trim() || resolveDatabaseName(configPath);
const argonHasherDir = resolve(process.cwd(), "../argon-hasher");

if (!existsSync(argonHasherDir)) {
	console.error(`Missing argon-hasher crate at ${argonHasherDir}`);
	process.exit(1);
}

let passwordHash = "";
try {
	passwordHash = execSync("cargo run --quiet -- hash admin", {
		cwd: argonHasherDir,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "inherit"],
	}).trim();
} catch (error) {
	console.error(
		`Failed to generate Argon2id admin hash with the Rust CLI: ${(error && error.message) || error}`
	);
	process.exit(1);
}

if (!passwordHash.startsWith("$argon2id$")) {
	console.error("The Rust CLI did not return a valid Argon2id PHC hash.");
	process.exit(1);
}

const sql = `
INSERT INTO users (id, username, name, email, email_verified_at, password_hash, is_admin)
VALUES ('${escapeSql(randomUUID())}', 'admin', 'Admin', '${escapeSql(email)}', '${escapeSql(new Date().toISOString())}', '${escapeSql(passwordHash)}', 1)
ON CONFLICT(username) DO UPDATE SET
  name = excluded.name,
  email = excluded.email,
  email_verified_at = excluded.email_verified_at,
  password_hash = excluded.password_hash,
  is_admin = 1;
`;

const tmpDir = join(process.cwd(), ".tmp");
const sqlPath = join(tmpDir, `seed-remote-admin-${Date.now()}.sql`);

try {
	if (!existsSync(tmpDir)) {
		mkdirSync(tmpDir, { recursive: true });
	}
	writeFileSync(sqlPath, sql, "utf8");
	execSync(
		`npx wrangler d1 execute ${JSON.stringify(dbName)} --remote --config ${JSON.stringify(configPath)} --file=${JSON.stringify(sqlPath)}`,
		{
			stdio: "inherit",
			cwd: process.cwd(),
		}
	);
	console.log('Remote admin ensured: username="admin" password="admin"');
	console.log(`Remote admin email: ${email}`);
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
} finally {
	try {
		unlinkSync(sqlPath);
	} catch {
		// ignore cleanup failures
	}
}