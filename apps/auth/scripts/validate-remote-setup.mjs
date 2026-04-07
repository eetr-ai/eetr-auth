#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import stripJsonComments from "strip-json-comments";

function parseArgs(argv) {
	const out = {
		mode: "upgrade",
		tfJson: "infra/out/terraform.tf.json",
		wranglerConfig: process.env.WRANGLER_CONFIG?.trim() || "wrangler.generated.jsonc",
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--mode" && argv[index + 1]) {
			out.mode = argv[++index];
		} else if (arg === "--tf-json" && argv[index + 1]) {
			out.tfJson = argv[++index];
		} else if ((arg === "--config" || arg === "--wrangler-config") && argv[index + 1]) {
			out.wranglerConfig = argv[++index];
		}
	}

	return out;
}

function fail(message) {
	console.error(message);
	process.exit(1);
}

function loadJsonc(filePath) {
	return JSON.parse(stripJsonComments(readFileSync(filePath, "utf8")));
}

function runWrangler(args, cwd) {
	return execFileSync("npx", ["wrangler", ...args], {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "inherit"],
	});
}

function assertFileExists(filePath, message) {
	if (!existsSync(filePath)) {
		fail(message);
	}
}

function validateWranglerConfig(config) {
	const d1 = config?.d1_databases?.[0];
	if (!d1?.database_name || !d1?.database_id) {
		fail("Wrangler config is missing d1_databases[0].database_name or database_id.");
	}

	const r2Bucket = config?.r2_buckets?.[0]?.bucket_name;
	if (typeof r2Bucket !== "string" || !r2Bucket.trim()) {
		fail("Wrangler config is missing r2_buckets[0].bucket_name.");
	}

	const argonHasher = Array.isArray(config?.services)
		? config.services.find((service) => service?.binding === "ARGON_HASHER")
		: null;
	if (!argonHasher || argonHasher.service !== "argon-hasher") {
		fail("Wrangler config is missing the ARGON_HASHER service binding to argon-hasher.");
	}
	if (!argonHasher.props || argonHasher.props.internal !== true) {
		fail("Wrangler config must set ARGON_HASHER.props.internal = true.");
	}

	if ((config?.vars?.HASH_METHOD ?? "").toLowerCase() !== "argon") {
		fail("Wrangler config must set HASH_METHOD=argon for remote installs and upgrades.");
	}
}

function validateCloudflareAuth(cwd) {
	if (process.env.CLOUDFLARE_API_TOKEN?.trim()) {
		return;
	}
	try {
		runWrangler(["whoami"], cwd);
	} catch {
		fail("Cloudflare auth is not available. Export CLOUDFLARE_API_TOKEN or run wrangler login.");
	}
	console.warn("CLOUDFLARE_API_TOKEN is not set; falling back to Wrangler user auth.");
}

function validateArgonHasher(cwd) {
	const argonHasherDir = resolve(cwd, "../argon-hasher");
	assertFileExists(argonHasherDir, `Missing argon-hasher workspace at ${argonHasherDir}.`);
	try {
		execFileSync("cargo", ["--version"], { cwd, stdio: ["ignore", "pipe", "inherit"] });
	} catch {
		fail("Rust cargo is required to seed the default admin via the argon-hasher CLI.");
	}
	try {
		const deployments = JSON.parse(runWrangler(["deployments", "list", "--name", "argon-hasher", "--json"], cwd));
		if (!Array.isArray(deployments) || deployments.length === 0) {
			fail("argon-hasher is not deployed in the current Cloudflare account.");
		}
	} catch {
		fail("Could not verify an existing argon-hasher deployment in Cloudflare.");
	}
}

function main() {
	const args = parseArgs(process.argv.slice(2));
	const cwd = process.cwd();
	const tfPath = resolve(cwd, args.tfJson);
	const configPath = resolve(cwd, args.wranglerConfig);

	assertFileExists(tfPath, `Missing Terraform output JSON at ${tfPath}. Run npm run infra:prepare-config first.`);
	assertFileExists(configPath, `Missing Wrangler config at ${configPath}. Run npm run infra:prepare-config first.`);

	validateCloudflareAuth(cwd);
	validateWranglerConfig(loadJsonc(configPath));

	if (args.mode === "clean-install") {
		validateArgonHasher(cwd);
	}

	console.log(`Remote ${args.mode} validation passed.`);
}

main();