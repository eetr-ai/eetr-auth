import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { md5 } from "@/lib/auth/md5";
import { hashPassword, verifyPassword } from "@/lib/auth/password-hash";

describe("hashPassword", () => {
	it("uses MD5 in md5 mode", async () => {
		await expect(hashPassword("password", { hashMethod: "md5" })).resolves.toBe(md5("password"));
	});

	it("uses the argon hasher service in argon mode", async () => {
		const fetch = vi.fn(async (request: Request) => {
			expect(request.url).toBe("https://argon-hasher.internal/hash");
			expect(request.method).toBe("POST");
			expect(await request.json()).toEqual({ password: "password" });

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
		const fetch = vi.fn(async (request: Request) => {
			expect(request.url).toBe("https://argon-hasher.internal/verify");
			expect(await request.json()).toEqual({
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
		const fetch = vi.fn(async (request: Request) => {
			expect(request.url).toBe("https://argon-hasher.internal/hash");
			expect(await request.json()).toEqual({ password: "password" });

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
});