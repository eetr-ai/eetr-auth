#!/usr/bin/env node
/**
 * Run `terraform output -json` in infra/terraform and write infra/out/terraform.tf.json
 */
import { execSync } from "node:child_process";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const tfDir = resolve(root, "infra/terraform");
const outDir = resolve(root, "infra/out");
const outFile = resolve(outDir, "terraform.tf.json");

if (!existsSync(tfDir)) {
	console.error("Missing infra/terraform — run from repo root.");
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
