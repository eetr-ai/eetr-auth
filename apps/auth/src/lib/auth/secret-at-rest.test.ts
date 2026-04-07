import { afterEach, describe, expect, it, vi } from "vitest";

import {
	CLIENT_SECRET_AT_REST_PREFIX,
	hashClientSecretForStorage,
	resolveHmacKey,
	verifyClientSecretAgainstStored,
} from "@/lib/auth/secret-at-rest";

describe("resolveHmacKey", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("returns the trimmed Cloudflare env value first", () => {
		expect(resolveHmacKey({ HMAC_KEY: "  env-key  " })).toBe("env-key");
	});

	it("falls back to process.env when Cloudflare env is absent", () => {
		vi.stubEnv("HMAC_KEY", "process-key");

		expect(resolveHmacKey()).toBe("process-key");
	});

	it("returns null when no key is configured", () => {
		vi.stubEnv("HMAC_KEY", " ");

		expect(resolveHmacKey()).toBeNull();
	});
});

describe("hashClientSecretForStorage", () => {
	it("stores the client secret as an h1-prefixed HMAC digest", async () => {
		await expect(hashClientSecretForStorage("plain-client-secret", "super-hmac-key")).resolves.toBe(
			`${CLIENT_SECRET_AT_REST_PREFIX}cb67f6bc64bf41721b0c44accee20f8382cb0bacba72a4618cbf1389a6e389d8`
		);
	});
});

describe("verifyClientSecretAgainstStored", () => {
	it("matches an h1-stored hash with the correct HMAC key", async () => {
		const stored = await hashClientSecretForStorage("plain-client-secret", "super-hmac-key");

		await expect(
			verifyClientSecretAgainstStored("plain-client-secret", stored, "super-hmac-key")
		).resolves.toEqual({ ok: true });
	});

	it("rejects an h1-stored hash with the wrong secret or missing HMAC key", async () => {
		const stored = await hashClientSecretForStorage("plain-client-secret", "super-hmac-key");

		await expect(
			verifyClientSecretAgainstStored("wrong-secret", stored, "super-hmac-key")
		).resolves.toEqual({ ok: false });
		await expect(verifyClientSecretAgainstStored("plain-client-secret", stored, null)).resolves.toEqual({
			ok: false,
		});
	});

	it("accepts matching legacy plaintext storage without an upgrade when no key exists", async () => {
		await expect(
			verifyClientSecretAgainstStored("legacy-secret", "legacy-secret", null)
		).resolves.toEqual({ ok: true });
	});

	it("returns an h1 upgrade value when matching legacy plaintext with a configured key", async () => {
		await expect(
			verifyClientSecretAgainstStored("legacy-secret", "legacy-secret", "upgrade-key")
		).resolves.toEqual({
			ok: true,
			upgradeToStored: await hashClientSecretForStorage("legacy-secret", "upgrade-key"),
		});
	});

	it("rejects non-matching legacy plaintext", async () => {
		await expect(
			verifyClientSecretAgainstStored("presented-secret", "stored-secret", "upgrade-key")
		).resolves.toEqual({ ok: false });
	});
});