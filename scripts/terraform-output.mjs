#!/usr/bin/env node
/**
 * Run `terraform output -json` in the repo-root infra/terraform and write
 * infra/out/terraform.tf.json. Self-chdir to apps/auth (npm run infra:terraform-output),
 * so infra resolves two levels up.
 */
import { execSync } from "node:child_process";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Run from apps/auth regardless of the caller's cwd — wrangler config, db/, infra/, and
// the sibling argon-hasher workspace all resolve relative to apps/auth.
process.chdir(fileURLToPath(new URL("../apps/auth", import.meta.url)));

const root = process.cwd();
const tfDir = resolve(root, "../../infra/terraform");
const outDir = resolve(root, "../../infra/out");
const outFile = resolve(outDir, "terraform.tf.json");

if (!existsSync(tfDir)) {
	console.error(`Missing infra/terraform (looked in ${tfDir}). Run via npm from apps/auth.`);
	process.exit(1);
}
if (!existsSync(outDir)) {
	mkdirSync(outDir, { recursive: true });
}

const json = execSync("terraform output -json", {
	cwd: tfDir,
	encoding: "utf8",
});
writeFileSync(outFile, json, "utf8");
console.log("Wrote", outFile);
