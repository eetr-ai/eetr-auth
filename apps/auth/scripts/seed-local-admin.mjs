#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import md5 from "md5";
import { join } from "node:path";

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

try {
	if (!existsSync(tmpDir)) {
		mkdirSync(tmpDir, { recursive: true });
	}
	writeFileSync(sqlPath, sql, "utf8");
	execSync(`npx wrangler d1 execute eetr-auth --local --file=${JSON.stringify(sqlPath)}`, {
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