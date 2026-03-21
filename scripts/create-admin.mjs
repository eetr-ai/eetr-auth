#!/usr/bin/env node
/**
 * Create an admin user in local and/or remote D1.
 * Usage: node scripts/create-admin.mjs <username> <password>
 *    or: ADMIN_USERNAME=x ADMIN_PASSWORD=y node scripts/create-admin.mjs
 *    or: USER_USERNAME=x USER_PASSWORD=y node scripts/create-admin.mjs
 * Options: --local-only | --remote-only (default: both)
 */
import { randomBytes, randomUUID, pbkdf2 } from "node:crypto";
import { promisify } from "node:util";
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const pbkdf2Async = promisify(pbkdf2);
const PBKDF2_ITERATIONS = 210000;

function encodeB64NoPad(buf) {
	return Buffer.from(buf).toString("base64").replace(/=+$/, "");
}

const args = process.argv.slice(2);
const localOnly = args.includes("--local-only");
const remoteOnly = args.includes("--remote-only");
const filteredArgs = args.filter((a) => a !== "--local-only" && a !== "--remote-only");

const username = filteredArgs[0] ?? process.env.ADMIN_USERNAME ?? process.env.USER_USERNAME;
const password = filteredArgs[1] ?? process.env.ADMIN_PASSWORD ?? process.env.USER_PASSWORD;

if (!username || !password) {
	console.error(
		"Usage: node scripts/create-admin.mjs <username> <password>\n" +
			"   or: ADMIN_USERNAME=x ADMIN_PASSWORD=y node scripts/create-admin.mjs\n" +
			"   or: USER_USERNAME=x USER_PASSWORD=y node scripts/create-admin.mjs\n" +
			"Options: --local-only or --remote-only (default: run both)"
	);
	process.exit(1);
}

function escapeSql(value) {
	return String(value).replace(/'/g, "''");
}

async function hashPassword(plain) {
	const salt = randomBytes(16);
	const hash = await pbkdf2Async(plain, salt, PBKDF2_ITERATIONS, 32, "sha256");
	return `$pbkdf2-sha256$${PBKDF2_ITERATIONS}$${encodeB64NoPad(salt)}$${encodeB64NoPad(hash)}`;
}

const id = randomUUID();
const passwordHash = await hashPassword(password);
const escapedUsername = escapeSql(username);
const escapedHash = escapeSql(passwordHash);

const sql = `INSERT INTO users (id, username, password_hash, is_admin) VALUES ('${id}', '${escapedUsername}', '${escapedHash}', 1);`;

const tmpDir = join(process.cwd(), ".tmp");
const sqlPath = join(tmpDir, `create-admin-${Date.now()}.sql`);

try {
	if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
	writeFileSync(sqlPath, sql, "utf8");

	const run = (target) => {
		const flag = target === "local" ? "--local" : "--remote";
		execSync(`npx wrangler d1 execute progression-ai-auth ${flag} --file=${sqlPath}`, {
			stdio: "inherit",
			cwd: process.cwd(),
		});
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

	console.log(`Admin "${username}" created (id: ${id}).`);
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
