#!/usr/bin/env node
/**
 * Set site_settings.site_url in local and/or remote D1.
 *
 * Usage: node scripts/set-site-url.mjs <site-url>
 *    or: SITE_URL=https://auth.example.com node scripts/set-site-url.mjs
 * Options: --local-only | --remote-only | --config <wrangler-config> | --site-url <url>
 * Env: WRANGLER_CONFIG (used when --config is not provided)
 */
import { writeFileSync, unlinkSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import stripJsonComments from "strip-json-comments";

const DEFAULT_LOCAL_WRANGLER_CONFIGS = ["wrangler.generated.jsonc", "infra/wrangler.template.jsonc"];

const args = process.argv.slice(2);
let localOnly = false;
let remoteOnly = false;
let wranglerConfig = process.env.WRANGLER_CONFIG?.trim() || "";
let siteUrlFlag = "";
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
	if (a === "--site-url" && args[i + 1]) {
		siteUrlFlag = args[++i];
		continue;
	}
	if (a.startsWith("--site-url=")) {
		siteUrlFlag = a.slice("--site-url=".length);
		continue;
	}
	filteredArgs.push(a);
}

if (!localOnly && !wranglerConfig) {
	wranglerConfig = "wrangler.generated.jsonc";
}

function resolveDefaultLocalConfigPath() {
	for (const candidate of DEFAULT_LOCAL_WRANGLER_CONFIGS) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	return "";
}

let configDbName = "";
let configDbBinding = "";

if (wranglerConfig) {
	try {
		const cfgRaw = readFileSync(wranglerConfig, "utf8");
		const cfg = JSON.parse(stripJsonComments(cfgRaw));
		if (Array.isArray(cfg?.d1_databases) && cfg.d1_databases[0]) {
			const fromBinding = cfg.d1_databases[0].binding;
			const fromConfig = cfg.d1_databases[0].database_name;
			if (typeof fromBinding === "string" && fromBinding.trim()) {
				configDbBinding = fromBinding.trim();
			}
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

const siteUrlRaw = siteUrlFlag || filteredArgs[0] || process.env.SITE_URL || "";
const normalizedSiteUrl = normalizeSiteUrl(siteUrlRaw);
if (!normalizedSiteUrl) {
	console.error(
		"Usage: node scripts/set-site-url.mjs <site-url>\n" +
			"   or: SITE_URL=https://auth.example.com node scripts/set-site-url.mjs\n" +
			"Options: --local-only | --remote-only | --config <wrangler-config> | --site-url <url>"
	);
	process.exit(1);
}

function normalizeSiteUrl(value) {
	const trimmed = String(value || "").trim();
	if (!trimmed) return "";
	const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
	try {
		const url = new URL(candidate);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			throw new Error("unsupported protocol");
		}
		url.hash = "";
		url.search = "";
		url.pathname = "";
		return url.toString().replace(/\/+$/, "");
	} catch {
		console.error("Invalid site URL.");
		process.exit(1);
	}
}

function escapeSql(value) {
	return String(value).replace(/'/g, "''");
}

const sql =
	"INSERT INTO site_settings (id, site_url) VALUES ('default', '" +
	escapeSql(normalizedSiteUrl) +
	"') ON CONFLICT(id) DO UPDATE SET site_url=excluded.site_url;";

const tmpDir = join(process.cwd(), ".tmp");
const sqlPath = join(tmpDir, `set-site-url-${Date.now()}.sql`);

try {
	if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
	writeFileSync(sqlPath, sql, "utf8");

	const localWranglerConfig = !remoteOnly
		? process.env.WRANGLER_CONFIG?.trim() || wranglerConfig || resolveDefaultLocalConfigPath()
		: wranglerConfig;
	const localDbTarget = configDbBinding || process.env.D1_DATABASE_NAME || configDbName || "eetr-auth";
	const remoteDbTarget = process.env.D1_DATABASE_NAME || configDbName;
	if (!localOnly && !remoteDbTarget) {
		console.error(
			"Remote site URL updates require wrangler.generated.jsonc, --config <path>, or D1_DATABASE_NAME. Run npm run infra:render-wrangler first."
		);
		process.exit(1);
	}
	const configArg = wranglerConfig ? ` --config ${JSON.stringify(wranglerConfig)}` : "";
	const localConfigArg = localWranglerConfig ? ` --config ${JSON.stringify(localWranglerConfig)}` : configArg;
	if (wranglerConfig) {
		console.log(`Using Wrangler config: ${wranglerConfig}`);
	}
	if (!remoteOnly && localWranglerConfig && localWranglerConfig !== wranglerConfig) {
		console.log(`Using local Wrangler config: ${localWranglerConfig}`);
	}
	if (!process.env.D1_DATABASE_NAME && configDbName) {
		console.log(`Using D1 database_name from config: ${configDbName}`);
	}

	const run = (target) => {
		const flag = target === "local" ? "--local" : "--remote";
		const dbTarget = target === "local" ? localDbTarget : remoteDbTarget;
		const runConfigArg = target === "local" ? localConfigArg : configArg;
		execSync(
			`npx wrangler d1 execute ${JSON.stringify(dbTarget)} ${flag}${runConfigArg} --file=${JSON.stringify(sqlPath)}`,
			{
				stdio: "inherit",
				cwd: process.cwd(),
			}
		);
	};

	if (!remoteOnly) {
		console.log("Setting site URL in local D1...");
		run("local");
		console.log("Local: done.");
	}
	if (!localOnly) {
		console.log("Setting site URL in remote D1...");
		run("remote");
		console.log("Remote: done.");
	}

	console.log(`site_settings.site_url set to: ${normalizedSiteUrl}`);
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
