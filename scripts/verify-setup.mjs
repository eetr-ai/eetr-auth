#!/usr/bin/env node
/**
 * Verify that an eetr-auth environment is configured correctly — primarily that the JWT
 * signing key and the published JWKS are consistent, so locally/remotely issued access
 * tokens actually verify at /userinfo and /token/validate.
 *
 *   npm run verify          # local  (.env.local/.dev.vars + local R2 + optional dev server)
 *   npm run verify:remote   # remote (deployed discovery + CDN JWKS + remote R2/secrets)
 *
 * Run from apps/auth (the npm scripts cd there). Read-only: it fetches public endpoints
 * and runs read-only wrangler commands; it never writes secrets or R2 objects.
 *
 * Remote, end-to-end signature check (optional): set VERIFY_CLIENT_ID + VERIFY_CLIENT_SECRET
 * to a client_credentials-capable client and the script will mint a token and verify it
 * against the published JWKS — the strongest proof that signing matches the JWKS.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { SignJWT, importPKCS8, jwtVerify, createLocalJWKSet } from "jose";
import stripJsonComments from "strip-json-comments";

const args = process.argv.slice(2);
const remote = args.includes("--remote");
const root = process.cwd();

// ---------------------------------------------------------------- reporting --
const C = { g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", c: "\x1b[1;36m", d: "\x1b[2m", x: "\x1b[0m" };
let pass = 0;
let fail = 0;
let warn = 0;
const ok = (m) => { pass++; console.log(`  ${C.g}PASS${C.x} ${m}`); };
const bad = (m) => { fail++; console.log(`  ${C.r}FAIL${C.x} ${m}`); };
const wrn = (m) => { warn++; console.log(`  ${C.y}WARN${C.x} ${m}`); };
const section = (m) => console.log(`\n${C.c}== ${m} ==${C.x}`);
const check = (cond, m, { warnOnly = false } = {}) => (cond ? ok(m) : warnOnly ? wrn(m) : bad(m));

// ------------------------------------------------------------------ helpers --
function parseEnvValue(content, name) {
	const regex = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=(.*)$`, "m");
	const match = content.match(regex);
	if (!match) return null;
	const raw = match[1].trim();
	if (!raw) return "";
	if (raw.startsWith('"') && raw.endsWith('"')) {
		try { return JSON.parse(raw); } catch { return raw.slice(1, -1); }
	}
	if (raw.startsWith("'") && raw.endsWith("'")) return raw.slice(1, -1);
	return raw;
}

function envReader() {
	const local = existsSync(join(root, ".env.local")) ? readFileSync(join(root, ".env.local"), "utf8") : "";
	const devVars = existsSync(join(root, ".dev.vars")) ? readFileSync(join(root, ".dev.vars"), "utf8") : "";
	return (name) => {
		const fromLocal = parseEnvValue(local, name);
		if (fromLocal !== null && fromLocal !== "") return fromLocal;
		return parseEnvValue(devVars, name);
	};
}

function loadWranglerConfig() {
	for (const candidate of ["wrangler.generated.jsonc", join("..", "..", "infra", "wrangler.template.jsonc")]) {
		const path = resolve(root, candidate);
		if (existsSync(path)) {
			try {
				return { path, config: JSON.parse(stripJsonComments(readFileSync(path, "utf8"))) };
			} catch (error) {
				return { path, config: null, error };
			}
		}
	}
	return { path: null, config: null };
}

function wrangler(commandArgs) {
	return execFileSync("npx", ["wrangler", ...commandArgs], {
		cwd: root,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
}

function jwksWellFormed(jwks) {
	return (
		!!jwks &&
		Array.isArray(jwks.keys) &&
		jwks.keys.length > 0 &&
		jwks.keys.every((k) => k && k.kty === "RSA" && typeof k.kid === "string" && k.kid.length > 0)
	);
}

async function signProbe(privatePem, kid) {
	const key = await importPKCS8(privatePem, "RS256");
	return new SignJWT({ probe: true })
		.setProtectedHeader({ alg: "RS256", kid })
		.setIssuedAt()
		.setExpirationTime("2m")
		.sign(key);
}

async function verifiesAgainst(jwks, token) {
	try {
		await jwtVerify(token, createLocalJWKSet(jwks), { algorithms: ["RS256"] });
		return true;
	} catch {
		return false;
	}
}

// -------------------------------------------------------------------- local --
async function verifyLocal() {
	console.log(`${C.d}Verifying LOCAL setup (apps/auth)${C.x}`);
	const env = envReader();
	const kid = env("JWT_KID");
	const privatePem = env("JWT_PRIVATE_KEY");
	const jwksJson = env("JWT_JWKS_JSON");

	section("JWT signing material (.env.local / .dev.vars)");
	check(!!kid, "JWT_KID present");
	check(!!privatePem, "JWT_PRIVATE_KEY present");
	check(!!jwksJson, "JWT_JWKS_JSON present");

	let envJwks = null;
	if (jwksJson) {
		try { envJwks = JSON.parse(jwksJson); ok("JWT_JWKS_JSON is valid JSON"); }
		catch { bad("JWT_JWKS_JSON is valid JSON"); }
	}
	if (envJwks) {
		check(jwksWellFormed(envJwks), "JWT_JWKS_JSON is a well-formed RSA JWKS");
		check(envJwks.keys?.some((k) => k.kid === kid), `JWT_KID (${kid}) is present in JWT_JWKS_JSON`);
	}

	let probe = null;
	if (privatePem && kid) {
		try { probe = await signProbe(privatePem, kid); ok("signed a probe JWT with JWT_PRIVATE_KEY"); }
		catch (e) { bad(`sign probe with JWT_PRIVATE_KEY: ${e.message}`); }
	}
	if (probe && envJwks) {
		check(await verifiesAgainst(envJwks, probe), "probe verifies against JWT_JWKS_JSON (private key ↔ env JWKS ↔ kid all match)");
	}

	section("Local R2 published JWKS (the kid the server signs with)");
	const { config } = loadWranglerConfig();
	const bucket = config?.r2_buckets?.[0]?.bucket_name;
	const jwksKey = (typeof config?.vars?.JWKS_R2_KEY === "string" && config.vars.JWKS_R2_KEY) || "jwks.json";
	if (!bucket || String(bucket).startsWith("REPLACE_WITH")) {
		wrn("R2 bucket not configured in wrangler config; skipping R2 check");
	} else {
		let r2jwks = null;
		try {
			r2jwks = JSON.parse(wrangler(["r2", "object", "get", `${bucket}/${jwksKey}`, "--local", "--pipe"]));
			ok(`fetched local R2 ${bucket}/${jwksKey}`);
		} catch (e) {
			bad(`local R2 ${bucket}/${jwksKey} not readable (${String(e.message).split("\n")[0]}). Run npm run setup:local:env to seed it.`);
		}
		if (r2jwks) {
			check(jwksWellFormed(r2jwks), "R2 JWKS is well-formed");
			check(r2jwks.keys?.some((k) => k.kid === kid), `R2 JWKS kid matches JWT_KID (${kid}) — server signs with a resolvable kid`);
			if (probe) {
				check(await verifiesAgainst(r2jwks, probe), "probe verifies against R2 JWKS (R2 public key matches the signing private key)");
			}
		}
	}

	section("Other local secrets");
	for (const name of ["AUTH_SECRET", "OAUTH_PENDING_SECRET", "HMAC_KEY"]) {
		check(!!env(name), `${name} present`);
	}
	if (env("AUTH_SECRET") === "changeme-local-auth-secret") wrn("AUTH_SECRET is still the placeholder value");

	section("Dev server (optional)");
	try {
		const res = await fetch("http://localhost:3000/.well-known/openid-configuration");
		const disc = await res.json();
		ok("discovery reachable at http://localhost:3000");
		check(Array.isArray(disc.scopes_supported) && disc.scopes_supported.includes("openid"), "discovery scopes_supported includes 'openid'");
	} catch {
		wrn("dev server not running on :3000 (start with npm run dev to also verify discovery)");
	}
}

// ------------------------------------------------------------------- remote --
async function verifyRemote() {
	console.log(`${C.d}Verifying REMOTE setup${C.x}`);
	const { path: configPath, config } = loadWranglerConfig();

	section("Remote configuration (wrangler config)");
	if (!config) { bad(`could not load a wrangler config (looked for wrangler.generated.jsonc / infra template)`); return; }
	const authUrl = config?.vars?.AUTH_URL;
	const cdnBase = config?.vars?.JWKS_CDN_BASE_URL;
	const jwksKey = (typeof config?.vars?.JWKS_R2_KEY === "string" && config.vars.JWKS_R2_KEY) || "jwks.json";
	const bucket = config?.r2_buckets?.[0]?.bucket_name;
	check(!!authUrl, "AUTH_URL configured");
	check(!!cdnBase, "JWKS_CDN_BASE_URL configured");
	let origin = null;
	if (authUrl) { try { origin = new URL(authUrl).origin; ok(`issuer origin = ${origin}`); } catch { bad("AUTH_URL is a valid URL"); } }

	section("Published OIDC discovery");
	let disc = null;
	if (origin) {
		try {
			const res = await fetch(`${origin}/.well-known/openid-configuration`);
			check(res.ok, `discovery responds 200 at ${origin}`);
			disc = await res.json();
		} catch (e) { bad(`fetch discovery: ${e.message}`); }
	}
	if (disc) {
		check(disc.issuer === origin, `issuer matches origin (${disc.issuer})`);
		check(Array.isArray(disc.scopes_supported) && disc.scopes_supported.includes("openid"), "scopes_supported includes 'openid'");
		check(Array.isArray(disc.response_types_supported) && disc.response_types_supported.includes("code"), "response_types_supported includes 'code'");
		check(!!disc.jwks_uri, `jwks_uri set (${disc.jwks_uri})`);
		if (cdnBase) {
			const expected = `${String(cdnBase).replace(/\/$/, "")}/${jwksKey}`;
			check(disc.jwks_uri === expected, `jwks_uri matches JWKS_CDN_BASE_URL + JWKS_R2_KEY (${expected})`, { warnOnly: true });
		}
	}

	section("Published JWKS (CDN)");
	const jwksUri = disc?.jwks_uri || (cdnBase ? `${String(cdnBase).replace(/\/$/, "")}/${jwksKey}` : null);
	let cdnJwks = null;
	if (jwksUri) {
		try {
			const res = await fetch(jwksUri);
			check(res.ok, `JWKS responds 200 at ${jwksUri}`);
			cdnJwks = await res.json();
		} catch (e) { bad(`fetch JWKS: ${e.message}`); }
	} else {
		bad("no jwks_uri available to fetch");
	}
	if (cdnJwks) check(jwksWellFormed(cdnJwks), "CDN JWKS is a well-formed RSA JWKS (kid, RS256)");

	section("R2 source vs CDN (kid consistency)");
	if (!bucket || String(bucket).startsWith("REPLACE_WITH")) {
		wrn("R2 bucket not configured; skipping R2/CDN consistency");
	} else {
		let r2jwks = null;
		try {
			r2jwks = JSON.parse(wrangler(["r2", "object", "get", `${bucket}/${jwksKey}`, "--remote", "--config", configPath, "--pipe"]));
			ok(`fetched remote R2 ${bucket}/${jwksKey}`);
		} catch (e) {
			wrn(`remote R2 read failed (${String(e.message).split("\n")[0]}); skipping R2/CDN consistency`);
		}
		if (r2jwks && cdnJwks) {
			const r2kids = new Set((r2jwks.keys || []).map((k) => k.kid));
			const cdnKids = new Set((cdnJwks.keys || []).map((k) => k.kid));
			const same = r2kids.size === cdnKids.size && [...r2kids].every((k) => cdnKids.has(k));
			check(same, `R2 kids {${[...r2kids]}} match CDN kids {${[...cdnKids]}} (CDN not serving a stale JWKS)`);
		}
	}

	section("Remote Wrangler secrets");
	try {
		const names = new Set(JSON.parse(wrangler(["secret", "list", "--config", configPath, "--format", "json"])).map((s) => s.name));
		check(names.has("JWT_PRIVATE_KEY"), "secret JWT_PRIVATE_KEY is set");
		// OAUTH_PENDING_SECRET intentionally omitted: the app falls back to AUTH_SECRET for it.
		for (const n of ["AUTH_SECRET", "HMAC_KEY"]) check(names.has(n), `secret ${n} is set`, { warnOnly: true });
	} catch (e) {
		wrn(`could not list remote secrets (${String(e.message).split("\n")[0]}) — check wrangler auth`);
	}

	section("End-to-end signing ↔ JWKS (optional)");
	const cid = process.env.VERIFY_CLIENT_ID;
	const csec = process.env.VERIFY_CLIENT_SECRET;
	if (cid && csec && disc?.token_endpoint && cdnJwks) {
		try {
			const res = await fetch(disc.token_endpoint, {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({ grant_type: "client_credentials", client_id: cid, client_secret: csec }),
			});
			const tok = await res.json();
			if (typeof tok.access_token === "string" && tok.access_token.split(".").length === 3) {
				check(await verifiesAgainst(cdnJwks, tok.access_token), "minted access token verifies against the published JWKS (signing key matches CDN)");
			} else {
				wrn(`client_credentials did not return a JWT (${tok.error ?? "no access_token"}); skipping signature check`);
			}
		} catch (e) { wrn(`client_credentials probe failed (${e.message})`); }
	} else {
		wrn("set VERIFY_CLIENT_ID + VERIFY_CLIENT_SECRET to also verify a freshly minted token against the JWKS");
	}
}

// ---------------------------------------------------------------------- run --
(async () => {
	if (remote) await verifyRemote();
	else await verifyLocal();
	console.log(`\n${C.c}Summary${C.x}: ${C.g}${pass} pass${C.x}, ${fail ? C.r : C.d}${fail} fail${C.x}, ${warn ? C.y : C.d}${warn} warn${C.x}`);
	if (fail > 0) {
		console.log(`${C.r}Setup verification FAILED.${C.x}`);
		process.exit(1);
	}
	console.log(`${C.g}Setup looks consistent.${C.x}`);
})().catch((err) => {
	console.error(err?.message || err);
	process.exit(1);
});
