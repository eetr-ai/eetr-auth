#!/usr/bin/env node
import { execFileSync } from "node:child_process";

function parseArgs(argv) {
	const out = {
		tfJson: "infra/out/terraform.tf.json",
		wranglerConfig: process.env.WRANGLER_CONFIG?.trim() || "wrangler.generated.jsonc",
		forceRotate: false,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--tf-json" && argv[index + 1]) {
			out.tfJson = argv[++index];
		} else if (arg === "--config" && argv[index + 1]) {
			out.wranglerConfig = argv[++index];
		} else if (arg === "--force-rotate-secrets") {
			out.forceRotate = true;
		}
	}

	return out;
}

function runNodeScript(scriptPath, scriptArgs) {
	execFileSync(process.execPath, [scriptPath, ...scriptArgs], {
		cwd: process.cwd(),
		stdio: "inherit",
	});
}

function runOpenNext(configPath) {
	execFileSync("npx", ["opennextjs-cloudflare", "build"], {
		cwd: process.cwd(),
		stdio: "inherit",
		env: {
			...process.env,
			SKIP_WRANGLER_CONFIG_CHECK: "yes",
			WRANGLER_CONFIG: configPath,
		},
	});
	execFileSync("npx", ["opennextjs-cloudflare", "deploy", "-c", configPath], {
		cwd: process.cwd(),
		stdio: "inherit",
		env: {
			...process.env,
			SKIP_WRANGLER_CONFIG_CHECK: "yes",
			WRANGLER_CONFIG: configPath,
		},
	});
}

function main() {
	const args = parseArgs(process.argv.slice(2));

	runNodeScript("scripts/terraform-output.mjs", ["--tf-json", args.tfJson]);
	runNodeScript("scripts/render-wrangler-config.mjs", [
		"--base",
		"infra/wrangler.template.jsonc",
		"--tf-json",
		args.tfJson,
		"--out",
		args.wranglerConfig,
	]);
	runNodeScript("scripts/validate-remote-setup.mjs", [
		"--mode",
		"upgrade",
		"--tf-json",
		args.tfJson,
		"--wrangler-config",
		args.wranglerConfig,
	]);
	runNodeScript("scripts/provision-env.mjs", [
		"--tf-json",
		args.tfJson,
		"--wrangler-config",
		args.wranglerConfig,
		args.forceRotate ? "--force-rotate" : "--skip-existing",
	]);
	runNodeScript("scripts/run-d1-migrate.mjs", ["--remote", "--config", args.wranglerConfig]);
	runOpenNext(args.wranglerConfig);

	console.log("");
	console.log("Remote upgrade complete.");
	console.log("Existing secrets were preserved unless --force-rotate-secrets was used.");
}

main();