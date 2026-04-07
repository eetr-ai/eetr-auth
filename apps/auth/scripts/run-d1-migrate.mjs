#!/usr/bin/env node
/**
 * Run wrangler d1 execute with D1_DATABASE_NAME (default progression-ai-auth).
 * Usage: node scripts/run-d1-migrate.mjs --local|--remote [--file=./db/schema.sql]
 */
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import stripJsonComments from "strip-json-comments";

const args = process.argv.slice(2);
const local = args.includes("--local");
const remote = args.includes("--remote");
const fileArg = args.find((a) => a.startsWith("--file="));
const file = fileArg ? fileArg.slice("--file=".length) : "./db/schema.sql";
const passthroughArgs = args.filter(
	(a) => a !== "--local" && a !== "--remote" && !a.startsWith("--file=")
);
const configArgIndex = passthroughArgs.findIndex((a) => a === "--config");
const configPath =
	configArgIndex >= 0 && passthroughArgs[configArgIndex + 1]
		? passthroughArgs[configArgIndex + 1]
		: passthroughArgs.find((a) => a.startsWith("--config="))?.slice("--config=".length) ?? "";

if (!local && !remote) {
	console.error("Usage: node scripts/run-d1-migrate.mjs --local|--remote [--file=./db/schema.sql]");
	process.exit(1);
}

let configDbName = "";

if (configPath) {
	try {
		const cfgRaw = readFileSync(resolve(process.cwd(), configPath), "utf8");
		const cfg = JSON.parse(stripJsonComments(cfgRaw));
		const fromConfig = cfg?.d1_databases?.[0]?.database_name;
		if (typeof fromConfig === "string" && fromConfig.trim()) {
			configDbName = fromConfig.trim();
		}
	} catch (error) {
		console.warn(
			`Warning: could not read Wrangler config ${configPath}: ${(error && error.message) || error}`
		);
	}
}

const dbName = process.env.D1_DATABASE_NAME || configDbName || "progression-ai-auth";
const flag = local ? "--local" : "--remote";
const filePath = resolve(process.cwd(), file);

const passthrough = passthroughArgs.length > 0 ? ` ${passthroughArgs.join(" ")}` : "";

execSync(`npx wrangler d1 execute ${dbName} ${flag} --file=${filePath}${passthrough}`, {
	stdio: "inherit",
	cwd: process.cwd(),
});
