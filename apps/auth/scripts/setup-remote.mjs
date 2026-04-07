#!/usr/bin/env node
import { execFileSync } from "node:child_process";

function parseArgs(argv) {
	const out = {
		tfJson: "infra/out/terraform.tf.json",
		wranglerConfig: process.env.WRANGLER_CONFIG?.trim() || "wrangler.generated.jsonc",
		adminEmail: process.env.ADMIN_EMAIL?.trim() || "",
		forceRotate: false,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--tf-json" && argv[index + 1]) {
			out.tfJson = argv[++index];
		} else if (arg === "--config" && argv[index + 1]) {
			out.wranglerConfig = argv[++index];
		} else if (arg === "--email" && argv[index + 1]) {
			out.adminEmail = argv[++index].trim();
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

function runOpenNextBuild(configPath) {
	execFileSync("npx", ["opennextjs-cloudflare", "build"], {
		cwd: process.cwd(),
		stdio: "inherit",
		env: {
			...process.env,
			SKIP_WRANGLER_CONFIG_CHECK: "yes",
			WRANGLER_CONFIG: configPath,
		},
	});
}

function runOpenNextDeploy(configPath) {
	execFileSync(
		"npx",
		["opennextjs-cloudflare", "deploy", "-c", configPath],
		{
			cwd: process.cwd(),
			stdio: "inherit",
			env: {
				...process.env,
				SKIP_WRANGLER_CONFIG_CHECK: "yes",
				WRANGLER_CONFIG: configPath,
			},
		}
	);
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
		"clean-install",
		"--tf-json",
		args.tfJson,
		"--config",
		args.wranglerConfig,
	]);
	runNodeScript("scripts/provision-env.mjs", [
		"--tf-json",
		args.tfJson,
		"--config",
		args.wranglerConfig,
		args.forceRotate ? "--force-rotate" : "--skip-existing",
	]);
	runNodeScript("scripts/run-d1-migrate.mjs", [
		"--remote",
		"--file=db/schema.sql",
		"--config",
		args.wranglerConfig,
	]);
	runOpenNextBuild(args.wranglerConfig);
	runOpenNextDeploy(args.wranglerConfig);
	const seedArgs = ["--config", args.wranglerConfig];
	if (args.adminEmail) {
		seedArgs.push("--email", args.adminEmail);
	}
	runNodeScript("scripts/seed-remote-admin.mjs", seedArgs);

	console.log("");
	console.log("Remote setup complete.");
	console.log("Required next step: sign in with the bootstrap admin and either delete it after creating a real admin or immediately change its password and replace the placeholder email with a real admin email.");
	console.log("Bootstrap admin: username=admin password=admin");
	if (args.adminEmail) {
		console.log(`Bootstrap admin email: ${args.adminEmail}`);
	}
}

main();