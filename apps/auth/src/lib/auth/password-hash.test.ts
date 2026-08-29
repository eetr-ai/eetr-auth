import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { md5 } from "@/lib/auth/md5";
import { hashPassword, verifyPassword } from "@/lib/auth/password-hash";

describe("hashPassword", () => {
	it("uses MD5 in md5 mode", async () => {
		await expect(hashPassword("password", { hashMethod: "md5" })).resolves.toBe(md5("password"));
	});

	it("uses the argon hasher service in argon mode", async () => {
		// The binding is called with a URL + init, never a Request object: under `next dev`
		// it is a cross-realm stub that would stringify a Request to "[object Request]".
		const fetch = vi.fn(async (url: string, init: RequestInit) => {
			expect(url).toBe("https://argon-hasher.internal/hash");
			expect(init.method).toBe("POST");
			expect(JSON.parse(String(init.body))).toEqual({ password: "password" });

			return Response.json({ hash: "$argon2id$v=19$m=19456,t=2,p=1$abc$def" });
		});

		await expect(
			hashPassword("password", {
				hashMethod: "argon",
				argonHasher: { fetch } as unknown as Fetcher,
			})
		).resolves.toBe("$argon2id$v=19$m=19456,t=2,p=1$abc$def");
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("throws when argon mode has no hasher binding", async () => {
		await expect(hashPassword("password", { hashMethod: "argon" })).rejects.toThrow(
			"HASH_METHOD=argon requires ARGON_HASHER binding"
		);
	});

	it("defaults to argon (not MD5) when no hashMethod is given, failing closed without a binding", async () => {
		await expect(hashPassword("password")).rejects.toThrow(
			"HASH_METHOD=argon requires ARGON_HASHER binding"
		);
	});

	it("throws when the argon hasher hash endpoint returns non-ok", async () => {
		const fetch = vi.fn(async () => new Response("service failed", { status: 503, statusText: "Unavailable" }));

		await expect(
			hashPassword("password", {
				hashMethod: "argon",
				argonHasher: { fetch } as unknown as Fetcher,
			})
		).rejects.toThrow("argon-hasher /hash failed: 503 Unavailable service failed");
	});

	it("throws when the argon hasher hash endpoint returns a non-argon hash", async () => {
		const fetch = vi.fn(async () => Response.json({ hash: "legacy-md5-value" }));

		await expect(
			hashPassword("password", {
				hashMethod: "argon",
				argonHasher: { fetch } as unknown as Fetcher,
			})
		).rejects.toThrow("argon-hasher /hash returned no Argon2 PHC string");
	});
});

describe("verifyPassword", () => {
	beforeEach(() => {
		vi.spyOn(console, "info").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("matches legacy MD5 hashes in md5 mode", async () => {
		await expect(verifyPassword("password", md5("password"), { hashMethod: "md5" })).resolves.toEqual({
			ok: true,
		});
	});

	it("rejects Argon2 stored hashes in md5 mode", async () => {
		await expect(
			verifyPassword("password", "$argon2id$v=19$m=19456,t=2,p=1$abc$def", { hashMethod: "md5" })
		).resolves.toEqual({ ok: false });
	});

	it("verifies an Argon2 stored hash through the hasher service", async () => {
		const fetch = vi.fn(async (url: string, init: RequestInit) => {
			expect(url).toBe("https://argon-hasher.internal/verify");
			expect(JSON.parse(String(init.body))).toEqual({
				password: "password",
				hash: "$argon2id$v=19$m=19456,t=2,p=1$abc$def",
			});

			return Response.json({ valid: true });
		});

		await expect(
			verifyPassword("password", "$argon2id$v=19$m=19456,t=2,p=1$abc$def", {
				hashMethod: "argon",
				argonHasher: { fetch } as unknown as Fetcher,
			})
		).resolves.toEqual({ ok: true });
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("upgrades a matching legacy MD5 hash to Argon2 in argon mode", async () => {
		const fetch = vi.fn(async (url: string, init: RequestInit) => {
			expect(url).toBe("https://argon-hasher.internal/hash");
			expect(JSON.parse(String(init.body))).toEqual({ password: "password" });

			return Response.json({ hash: "$argon2id$v=19$m=19456,t=2,p=1$upgrade$newhash" });
		});

		await expect(
			verifyPassword("password", md5("password"), {
				hashMethod: "argon",
				argonHasher: { fetch } as unknown as Fetcher,
			})
		).resolves.toEqual({
			ok: true,
			rehash: "$argon2id$v=19$m=19456,t=2,p=1$upgrade$newhash",
		});
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("rejects argon mode when the legacy MD5 password does not match", async () => {
		const fetch = vi.fn();

		await expect(
			verifyPassword("wrong-password", md5("password"), {
				hashMethod: "argon",
				argonHasher: { fetch } as unknown as Fetcher,
			})
		).resolves.toEqual({ ok: false });
		expect(fetch).not.toHaveBeenCalled();
	});

	it("rejects md5 mode for unsupported stored hash format", async () => {
		await expect(verifyPassword("password", "not-a-supported-hash", { hashMethod: "md5" })).resolves.toEqual({
			ok: false,
		});
	});

	it("rejects argon mode when hasher binding is missing", async () => {
		await expect(
			verifyPassword("password", "$argon2id$v=19$m=19456,t=2,p=1$abc$def", { hashMethod: "argon" })
		).resolves.toEqual({ ok: false });
	});

	it("rejects argon mode when hasher verify endpoint returns non-ok", async () => {
		const fetch = vi.fn(async () => new Response("downstream error", { status: 500, statusText: "Server Error" }));

		await expect(
			verifyPassword("password", "$argon2id$v=19$m=19456,t=2,p=1$abc$def", {
				hashMethod: "argon",
				argonHasher: { fetch } as unknown as Fetcher,
			})
		).resolves.toEqual({ ok: false });
	});

	it("rejects argon mode when hasher verify endpoint returns invalid json", async () => {
		const fetch = vi.fn(async () =>
			new Response("not-json", {
				status: 200,
				headers: { "Content-Type": "application/json" },
			})
		);

		await expect(
			verifyPassword("password", "$argon2id$v=19$m=19456,t=2,p=1$abc$def", {
				hashMethod: "argon",
				argonHasher: { fetch } as unknown as Fetcher,
			})
		).resolves.toEqual({ ok: false });
	});

	it("rejects argon mode for unsupported stored hash format", async () => {
		const fetch = vi.fn();

		await expect(
			verifyPassword("password", "weird-format-hash", {
				hashMethod: "argon",
				argonHasher: { fetch } as unknown as Fetcher,
			})
		).resolves.toEqual({ ok: false });
		expect(fetch).not.toHaveBeenCalled();
	});
});
/**
 * Test users (users.is_test_user = 1) are passwordless and store '' in the NOT NULL
 * password_hash column, mirroring how public clients store '' in client_secret. The whole
 * "a test user can never authenticate with a password" invariant rests on verifyPassword
 * rejecting that sentinel, so pin it here rather than re-deriving it from the source every
 * time someone touches the stored-hash format predicates.
 */
describe("verifyPassword with the empty password_hash sentinel", () => {
	const sentinels = ["", "   "];
	const attempts = ["", "   ", "password", "$argon2id$v=19$m=19456,t=2,p=1$abc$def", md5("")];

	for (const storedHash of sentinels) {
		for (const attempt of attempts) {
			it(`rejects ${JSON.stringify(attempt)} against ${JSON.stringify(storedHash)} in md5 mode`, async () => {
				await expect(verifyPassword(attempt, storedHash, { hashMethod: "md5" })).resolves.toEqual({
					ok: false,
				});
			});

			it(`rejects ${JSON.stringify(attempt)} against ${JSON.stringify(storedHash)} in argon mode`, async () => {
				const fetch = vi.fn(async () => Response.json({ valid: true }));

				await expect(
					verifyPassword(attempt, storedHash, {
						hashMethod: "argon",
						argonHasher: { fetch } as unknown as Fetcher,
					})
				).resolves.toEqual({ ok: false });
				// The sentinel is rejected on shape alone. Reaching the hasher would mean a
				// service that answered `valid: true` could authenticate a passwordless account.
				expect(fetch).not.toHaveBeenCalled();
			});
		}
	}

	it("rejects the sentinel in argon mode with no hasher binding", async () => {
		await expect(verifyPassword("password", "", { hashMethod: "argon" })).resolves.toEqual({
			ok: false,
		});
	});

	it("never offers a rehash for the sentinel, so a failed attempt cannot upgrade it", async () => {
		const result = await verifyPassword("password", "", { hashMethod: "md5" });
		expect(result.rehash).toBeUndefined();
	});
});
