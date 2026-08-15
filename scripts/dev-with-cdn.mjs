#!/usr/bin/env node
/**
 * Runs the auth app and the local CDN stand-in together, so `npm run dev`
 * reproduces production's split between the app origin and the asset origin.
 *
 * Either child exiting takes the other down, so Ctrl-C never leaves an
 * orphaned port bound.
 */
import { spawn } from "node:child_process";

const children = [];
let shuttingDown = false;

function run(name, command, args) {
	const child = spawn(command, args, { stdio: "inherit", shell: false });
	child.on("exit", (code, signal) => {
		if (shuttingDown) return;
		shuttingDown = true;
		console.log(`\n${name} exited (${signal ?? code}); stopping the others.`);
		stopAll();
		process.exit(code ?? 0);
	});
	children.push(child);
	return child;
}

function stopAll() {
	for (const child of children) {
		if (!child.killed) child.kill("SIGINT");
	}
}

for (const signal of ["SIGINT", "SIGTERM"]) {
	process.on(signal, () => {
		shuttingDown = true;
		stopAll();
		process.exit(0);
	});
}

run("auth", "npm", ["run", "dev", "--workspace=apps/auth"]);
run("dev-cdn", "node", ["scripts/dev-cdn.mjs"]);
