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
 *     v0.5.1 is how databases ended up stamped with a version no tag matched;
 *   - every patch added or edited since the previous tag must carry the release's number.
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

/** Versions of the patch files added or edited since `tag`, or null when git cannot tell. */
function patchesChangedSince(tag) {
	const diff = spawnSync("git", ["diff", "--name-only", tag, "--", "db/patches"], { cwd: root, encoding: "utf8" });
	if (diff.status !== 0) {
		errors.push(`Could not diff against tag ${tag} (fetch tags with fetch-depth: 0): ${diff.stderr.trim()}`);
		return null;
	}
	const ret = [];
	for (const path of diff.stdout.split("\n").filter(Boolean)) {
		const version = path.match(/(\d+\.\d+\.\d+)\.sql$/)?.[1];
		if (version) ret.push(version);
	}
	return ret;
}

if (release) {
	if (compareVersions(newestPatch, currentRelease) > 0) {
		errors.push(
			`Releasing v${currentRelease}, but db/patches/${newestPatch}.sql is newer. The patch must ship in the release that matches its name: ` +
				`add a "Release-As: ${newestPatch}" footer (or a breaking change) so release-please cuts v${newestPatch}.`
		);
	}
	// The manifest already names the release being cut, so the last shipped one is the
	// highest tag below it. Every patch touched since then ships in this release and must
	// carry its number -- a 0.6.0.sql riding out in v0.7.0 breaks the rule just the same.
	const tags = spawnSync("git", ["tag", "--list", "v*"], { cwd: root, encoding: "utf8" });
	const previousRelease = (tags.stdout ?? "")
		.split("\n")
		.map((tag) => tag.trim().replace(/^v/, ""))
		.filter((version) => /^\d+\.\d+\.\d+$/.test(version) && compareVersions(version, currentRelease) < 0)
		.sort(compareVersions)
		.at(-1);
	if (!previousRelease) {
		errors.push(`Could not find a release tag below v${currentRelease} (fetch tags with fetch-depth: 0).`);
	} else {
		for (const version of patchesChangedSince(`v${previousRelease}`) ?? []) {
			if (version !== currentRelease) {
				errors.push(
					`db/patches/${version}.sql changed since v${previousRelease} but this release is v${currentRelease}. ` +
						`Rename the patch to ${currentRelease}.sql, or add a "Release-As: ${version}" footer.`
				);
			}
		}
	}
} else {
	// On a normal PR the manifest names the last release, so any patch at or below it is
	// already on deployed databases and must stay frozen.
	for (const version of patchesChangedSince(`v${currentRelease}`) ?? []) {
		if (compareVersions(version, currentRelease) <= 0) {
			errors.push(`db/patches/${version}.sql shipped in v${version} and must not change; add the next release's patch instead.`);
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
