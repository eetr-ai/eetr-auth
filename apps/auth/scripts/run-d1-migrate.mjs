#!/usr/bin/env node
/**
 * Run wrangler d1 execute with D1_DATABASE_NAME or the remote Wrangler config database name.
 * When no --file is provided, this applies versioned SQL patches from ./db/patches.
 * Databases without schema metadata are treated as schema version 0.0.0.
 * Usage: node scripts/run-d1-migrate.mjs --local|--remote [--file=./db/schema.sql]
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import stripJsonComments from "strip-json-comments";

const INITIAL_SCHEMA_VERSION = "0.0.0";
const DEFAULT_LOCAL_WRANGLER_CONFIGS = ["wrangler.generated.jsonc", "infra/wrangler.template.jsonc"];

const args = process.argv.slice(2);
const local = args.includes("--local");
const remote = args.includes("--remote");
const fileArg = args.find((a) => a.startsWith("--file="));
const file = fileArg ? fileArg.slice("--file=".length) : "";
const passthroughArgs = args.filter(
	(a) => a !== "--local" && a !== "--remote" && !a.startsWith("--file=")
);
const configArgIndex = passthroughArgs.findIndex((a) => a === "--config");
let configPath =
	configArgIndex >= 0 && passthroughArgs[configArgIndex + 1]
		? passthroughArgs[configArgIndex + 1]
		: passthroughArgs.find((a) => a.startsWith("--config="))?.slice("--config=".length) ?? "";

function resolveDefaultLocalConfigPath() {
	for (const candidate of DEFAULT_LOCAL_WRANGLER_CONFIGS) {
		if (existsSync(resolve(process.cwd(), candidate))) {
			return candidate;
		}
	}

	return "";
}

if (local && !configPath) {
	configPath = process.env.WRANGLER_CONFIG?.trim() || resolveDefaultLocalConfigPath();
	if (configPath) {
		passthroughArgs.push("--config", configPath);
	}
}

if (remote && !configPath) {
	configPath = process.env.WRANGLER_CONFIG?.trim() || "wrangler.generated.jsonc";
	passthroughArgs.push("--config", configPath);
}

if (!local && !remote) {
	console.error("Usage: node scripts/run-d1-migrate.mjs --local|--remote [--file=./db/schema.sql]");
	process.exit(1);
}

let configDbName = "";
let configDbBinding = "";

if (configPath) {
	try {
		const cfgRaw = readFileSync(resolve(process.cwd(), configPath), "utf8");
		const cfg = JSON.parse(stripJsonComments(cfgRaw));
		const fromBinding = cfg?.d1_databases?.[0]?.binding;
		const fromConfig = cfg?.d1_databases?.[0]?.database_name;
		if (typeof fromBinding === "string" && fromBinding.trim()) {
			configDbBinding = fromBinding.trim();
		}
		if (typeof fromConfig === "string" && fromConfig.trim()) {
			configDbName = fromConfig.trim();
		}
	} catch (error) {
		console.warn(
			`Warning: could not read Wrangler config ${configPath}: ${(error && error.message) || error}`
		);
	}
}

const dbTarget = local
	? configDbBinding || process.env.D1_DATABASE_NAME || configDbName || "eetr-auth"
	: process.env.D1_DATABASE_NAME || configDbName;
if (!dbTarget) {
	console.error(
		"Remote migrations could not determine the D1 database name. Set D1_DATABASE_NAME or provide a Wrangler config with d1_databases[0].database_name."
	);
	process.exit(1);
}
const flag = local ? "--local" : "--remote";
const workspaceCwd = process.cwd();
const schemaSnapshotPath = resolve(workspaceCwd, "./db/schema.sql");

function compareVersions(left, right) {
	const leftParts = left.split(".").map(Number);
	const rightParts = right.split(".").map(Number);

	for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
		const leftValue = leftParts[index] ?? 0;
		const rightValue = rightParts[index] ?? 0;

		if (leftValue < rightValue) return -1;
		if (leftValue > rightValue) return 1;
	}

	return 0;
}

function runWrangler(argsList, options = {}) {
	const result = spawnSync("npx", ["wrangler", "d1", "execute", dbTarget, flag, ...argsList], {
		cwd: workspaceCwd,
		encoding: "utf8",
		stdio: options.captureOutput ? ["inherit", "pipe", "pipe"] : "inherit",
	});

	if (result.status !== 0) {
		if (options.captureOutput) {
			if (result.stdout) {
				process.stdout.write(result.stdout);
			}
			if (result.stderr) {
				process.stderr.write(result.stderr);
			}
		}

		process.exit(result.status ?? 1);
	}

	return result.stdout ?? "";
}

function extractResultRows(payload) {
	if (Array.isArray(payload)) {
		for (const value of payload) {
			const rows = extractResultRows(value);
			if (rows) {
				return rows;
			}
		}
		return null;
	}

	if (!payload || typeof payload !== "object") {
		return null;
	}

	if ("success" in payload && Array.isArray(payload.results)) {
		return payload.results;
	}

	for (const value of Object.values(payload)) {
		const rows = extractResultRows(value);
		if (rows) {
			return rows;
		}
	}

	return null;
}

function runJsonQuery(command) {
	const output = runWrangler(["--json", "--command", command, ...passthroughArgs], {
		captureOutput: true,
	});

	const payload = JSON.parse(output);
	return extractResultRows(payload) ?? [];
}

function metadataTableExists() {
	const rows = runJsonQuery(
		"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_metadata';"
	);

	return rows.length > 0;
}

function hasUserTables() {
	const rows = runJsonQuery(
		[
			"SELECT name",
			"FROM sqlite_master",
			"WHERE type = 'table'",
			"AND name NOT LIKE 'sqlite_%'",
			"AND name != 'schema_metadata';",
		].join(" ")
	);

	return rows.length > 0;
}

function getCurrentSchemaVersion() {
	if (!metadataTableExists()) {
		return INITIAL_SCHEMA_VERSION;
	}

	const rows = runJsonQuery(
		"SELECT value FROM schema_metadata WHERE key = 'schema_version' LIMIT 1;"
	);
	const version = rows[0]?.value;

	if (typeof version !== "string" || version.trim().length === 0) {
		throw new Error("schema_metadata exists but schema_version is missing.");
	}

	return version.trim();
}

function getPatchPlan(currentVersion) {
	const patchesDir = resolve(workspaceCwd, "./db/patches");
	const patchFiles = readdirSync(patchesDir)
		.filter((entry) => /^\d+\.\d+\.\d+\.sql$/u.test(entry))
		.map((entry) => ({
			version: entry.replace(/\.sql$/u, ""),
			filePath: resolve(patchesDir, entry),
		}))
		.sort((left, right) => compareVersions(left.version, right.version));

	return patchFiles.filter((patch) => compareVersions(patch.version, currentVersion) > 0);
}

if (file) {
	const filePath = resolve(workspaceCwd, file);
	runWrangler(["--file", filePath, ...passthroughArgs]);
	process.exit(0);
}

const currentVersion = getCurrentSchemaVersion();

if (currentVersion === INITIAL_SCHEMA_VERSION && !hasUserTables()) {
	console.log(`No existing schema detected. Applying current schema snapshot from ${schemaSnapshotPath}`);
	runWrangler(["--file", schemaSnapshotPath, ...passthroughArgs]);
	console.log("Schema bootstrapped from snapshot.");
	process.exit(0);
}

const patchPlan = getPatchPlan(currentVersion);

if (patchPlan.length === 0) {
	console.log(`Schema is already up to date at version ${currentVersion}.`);
	process.exit(0);
}

console.log(`Current schema version: ${currentVersion}`);

for (const patch of patchPlan) {
	console.log(`Applying schema patch ${patch.version} from ${patch.filePath}`);
	runWrangler(["--file", patch.filePath, ...passthroughArgs]);
	console.log(`Applied schema patch ${patch.version}`);
}

console.log(`Schema migrated to version ${patchPlan[patchPlan.length - 1]?.version ?? currentVersion}.`);
