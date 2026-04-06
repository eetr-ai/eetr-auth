#!/usr/bin/env node
/**
 * Run wrangler d1 execute with D1_DATABASE_NAME (default progression-ai-auth).
 * Usage: node scripts/run-d1-migrate.mjs --local|--remote [--file=./db/schema.sql]
 */
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const local = args.includes("--local");
const remote = args.includes("--remote");
const fileArg = args.find((a) => a.startsWith("--file="));
const file = fileArg ? fileArg.slice("--file=".length) : "./db/schema.sql";
const passthroughArgs = args.filter(
	(a) => a !== "--local" && a !== "--remote" && !a.startsWith("--file=")
);

if (!local && !remote) {
	console.error("Usage: node scripts/run-d1-migrate.mjs --local|--remote [--file=./db/schema.sql]");
	process.exit(1);
}

const dbName = process.env.D1_DATABASE_NAME || "progression-ai-auth";
const flag = local ? "--local" : "--remote";
const filePath = resolve(process.cwd(), file);

const passthrough = passthroughArgs.length > 0 ? ` ${passthroughArgs.join(" ")}` : "";

execSync(`npx wrangler d1 execute ${dbName} ${flag} --file=${filePath}${passthrough}`, {
	stdio: "inherit",
	cwd: process.cwd(),
});
