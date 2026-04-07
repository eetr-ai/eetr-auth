#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import md5 from "md5";
import stripJsonComments from "strip-json-comments";

const DEFAULT_LOCAL_WRANGLER_CONFIGS = ["wrangler.generated.jsonc", "infra/wrangler.template.jsonc"];

const username = "admin";
const password = "admin";
const email = "admin@local.dev";
const name = "Local Admin";
const id = randomUUID();
const now = new Date().toISOString();
const passwordHash = md5(password);

function escapeSql(value) {
	return String(value).replace(/'/g, "''");
}

const sql = `
INSERT INTO users (id, username, name, email, email_verified_at, password_hash, is_admin)
VALUES ('${escapeSql(id)}', '${escapeSql(username)}', '${escapeSql(name)}', '${escapeSql(email)}', '${escapeSql(now)}', '${escapeSql(passwordHash)}', 1)
ON CONFLICT(username) DO UPDATE SET
  name = excluded.name,
  email = excluded.email,
  email_verified_at = excluded.email_verified_at,
  password_hash = excluded.password_hash,
  is_admin = 1;
`;

const tmpDir = join(process.cwd(), ".tmp");
const sqlPath = join(tmpDir, `seed-local-admin-${Date.now()}.sql`);

function resolveDefaultLocalConfigPath() {
	for (const candidate of DEFAULT_LOCAL_WRANGLER_CONFIGS) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	return "";
}

function resolveLocalDbTarget(configPath) {
	if (!configPath) {
		return process.env.D1_DATABASE_NAME?.trim() || "eetr-auth";
	}

	try {
		const cfgRaw = readFileSync(configPath, "utf8");
		const cfg = JSON.parse(stripJsonComments(cfgRaw));
		const binding = cfg?.d1_databases?.[0]?.binding;
		const databaseName = cfg?.d1_databases?.[0]?.database_name;

		if (typeof binding === "string" && binding.trim()) {
			return binding.trim();
		}

		if (typeof databaseName === "string" && databaseName.trim()) {
			return databaseName.trim();
		}
	} catch (error) {
		console.warn(
			`Warning: could not read Wrangler config ${configPath}: ${(error && error.message) || error}`
		);
	}

	return process.env.D1_DATABASE_NAME?.trim() || "eetr-auth";
}

try {
	if (!existsSync(tmpDir)) {
		mkdirSync(tmpDir, { recursive: true });
	}
	writeFileSync(sqlPath, sql, "utf8");
	const wranglerConfig = process.env.WRANGLER_CONFIG?.trim() || resolveDefaultLocalConfigPath();
	const dbTarget = resolveLocalDbTarget(wranglerConfig);
	const configArg = wranglerConfig ? ` --config ${JSON.stringify(wranglerConfig)}` : "";
	if (wranglerConfig) {
		console.log(`Using Wrangler config: ${wranglerConfig}`);
	}
	execSync(`npx wrangler d1 execute ${JSON.stringify(dbTarget)} --local${configArg} --file=${JSON.stringify(sqlPath)}`, {
		stdio: "inherit",
		cwd: process.cwd(),
	});
	console.log('Local admin ensured: username="admin" password="admin"');
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