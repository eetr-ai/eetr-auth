#!/usr/bin/env node
/**
 * Guard the rule in db/README.md: a schema patch is named after the release tag it ships
 * in, and db/schema.sql carries the same version as the newest patch.
 *
 * Always checked:
 *   - every db/patches/<v>.sql ends by stamping schema_version = '<v>';
 *   - db/schema.sql stamps the newest patch version;
 *   - no patch at or below the current release (the manifest) changed since that tag --
 *     deployed databases already report that version, so the migrator would skip the edit.
 *
 * With --release (run on the push that merges a release-please PR), additionally:
 *   - the newest patch must not be ahead of the release being cut. Shipping 0.6.0.sql in
 *     v0.5.1 is how databases ended up stamped with a version no tag matched.
 *
 * Usage: node scripts/check-schema-version.mjs [--release]
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const release = process.argv.includes("--release");

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

function stampedVersions(sql) {
	const ret = [];
	for (const match of sql.matchAll(/schema_metadata[\s\S]*?'schema_version'[\s\S]*?'(\d+\.\d+\.\d+)'|SET value = '(\d+\.\d+\.\d+)' WHERE key = 'schema_version'/g)) {
		ret.push(match[1] ?? match[2]);
	}
	return ret;
}

const errors = [];
const patchesDir = resolve(root, "db/patches");
const patches = readdirSync(patchesDir)
	.filter((name) => /^\d+\.\d+\.\d+\.sql$/.test(name))
	.map((name) => name.slice(0, -".sql".length))
	.sort(compareVersions);
const newestPatch = patches.at(-1);

for (const version of patches) {
	const stamped = stampedVersions(readFileSync(resolve(patchesDir, `${version}.sql`), "utf8"));
	if (stamped.at(-1) !== version) {
		errors.push(`db/patches/${version}.sql must end by setting schema_version to '${version}' (found ${stamped.at(-1) ?? "none"}).`);
	}
}

const snapshotVersion = stampedVersions(readFileSync(resolve(root, "db/schema.sql"), "utf8"))[0];
if (snapshotVersion !== newestPatch) {
	errors.push(`db/schema.sql stamps schema_version '${snapshotVersion}', but the newest patch is ${newestPatch}.`);
}

const manifest = JSON.parse(readFileSync(resolve(root, ".release-please-manifest.json"), "utf8"));
const currentRelease = manifest["."];

if (release) {
	if (compareVersions(newestPatch, currentRelease) > 0) {
		errors.push(
			`Releasing v${currentRelease}, but db/patches/${newestPatch}.sql is newer. The patch must ship in the release that matches its name: ` +
				`add a "Release-As: ${newestPatch}" footer (or a breaking change) so release-please cuts v${newestPatch}.`
		);
	}
} else {
	// On a normal PR the manifest names the last release, so any patch at or below it is
	// already on deployed databases and must stay frozen.
	const diff = spawnSync("git", ["diff", "--name-only", `v${currentRelease}`, "--", "db/patches"], {
		cwd: root,
		encoding: "utf8",
	});
	if (diff.status !== 0) {
		errors.push(`Could not diff against tag v${currentRelease} (fetch tags with fetch-depth: 0): ${diff.stderr.trim()}`);
	} else {
		for (const path of diff.stdout.split("\n").filter(Boolean)) {
			const version = path.match(/(\d+\.\d+\.\d+)\.sql$/)?.[1];
			if (version && compareVersions(version, currentRelease) <= 0) {
				errors.push(`${path} shipped in v${version} and must not change; add the next release's patch instead.`);
			}
		}
	}
}

if (errors.length > 0) {
	for (const error of errors) console.error(`✖ ${error}`);
	process.exit(1);
}
console.log(
	`Schema version OK: newest patch ${newestPatch}, schema.sql ${snapshotVersion}, ${release ? "releasing" : "last release"} v${currentRelease}.`
);
