#!/usr/bin/env node
/**
 * Seed an admin and two non-admin users into the LOCAL D1 database for end-to-end checks of the
 * consent screen and the non-admin landing page. Local-only: passwords are MD5 like
 * seed-local-admin.mjs, which only works with HASH_METHOD=md5 in .dev.vars.
 *
 *   e2e_admin / e2e-admin-pass  (admin -- leaves the regular `admin` account alone)
 *   e2e_alice / e2e-alice-pass  (granted the "local" environment)
 *   e2e_bob   / e2e-bob-pass    (granted the "local" environment)
 *
 * Usage: node scripts/seed-local-e2e-users.mjs
 */
import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import md5 from "md5";
import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL("../apps/auth", import.meta.url)));

const USERS = [
	{ username: "e2e_admin", password: "e2e-admin-pass", name: "Admin E2E", email: "admin@e2e.local", isAdmin: true },
	{ username: "e2e_alice", password: "e2e-alice-pass", name: "Alice E2E", email: "alice@e2e.local" },
	{ username: "e2e_bob", password: "e2e-bob-pass", name: "Bob E2E", email: "bob@e2e.local" },
];
const ENVIRONMENT = "local";

function escapeSql(value) {
	return String(value).replace(/'/g, "''");
}

const now = new Date().toISOString();
let sql = "";
for (const user of USERS) {
	sql += `
INSERT INTO users (id, username, name, email, email_verified_at, password_hash, is_admin, password_updated_at)
VALUES ('${randomUUID()}', '${escapeSql(user.username)}', '${escapeSql(user.name)}', '${escapeSql(user.email)}', '${now}', '${md5(user.password)}', ${user.isAdmin ? 1 : 0}, '${now}')
ON CONFLICT(username) DO UPDATE SET
  name = excluded.name,
  email = excluded.email,
  password_hash = excluded.password_hash,
  password_updated_at = excluded.password_updated_at,
  is_admin = excluded.is_admin;
INSERT OR IGNORE INTO users_environments (id, user_id, environment_id)
SELECT '${randomUUID()}', u.id, e.id FROM users u, environments e
WHERE u.username = '${escapeSql(user.username)}' AND e.name = '${ENVIRONMENT}';
`;
}

const tmpDir = join(process.cwd(), ".tmp");
if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
const sqlPath = join(tmpDir, `seed-local-e2e-users-${Date.now()}.sql`);
writeFileSync(sqlPath, sql);
try {
	execSync(`node ../../scripts/run-d1-migrate.mjs --local --file=${sqlPath}`, { stdio: "inherit" });
	console.log(`Seeded ${USERS.map((u) => u.username).join(", ")} into the local D1 database.`);
} finally {
	unlinkSync(sqlPath);
}
