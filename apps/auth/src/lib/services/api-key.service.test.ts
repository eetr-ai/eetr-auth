import { beforeEach, describe, expect, it, vi } from "vitest";

import { generateApiKey } from "@/lib/auth/api-key-format";
import type { ApiKeyRepository, ApiKeyWithHash } from "@/lib/repositories/api-key.repository";
import type { Client, ClientRepository } from "@/lib/repositories/client.repository";
import type { UserRecord, UserRepository } from "@/lib/repositories/admin.repository";
import type { TokenRepository } from "@/lib/repositories/token.repository";
import type { AdminAuditLogRepository } from "@/lib/repositories/admin-audit-log.repository";
import { AdminAuditLogService } from "@/lib/services/admin-audit-log.service";
import { ApiKeyService } from "@/lib/services/api-key.service";
import { isOAuthServiceError } from "@/lib/services/oauth.types";

/**
 * Stands in for the argon-hasher Worker. `/hash` returns a PHC-shaped string that embeds
 * the plaintext, and `/verify` compares against it, so a test can assert that the right
 * secret half reached the hasher without running real Argon2.
 */
function createArgonHasherMock(): Fetcher {
	const fetch = vi.fn(async (url: string, init: RequestInit) => {
		const body = JSON.parse(String(init.body)) as { password: string; hash?: string };
		if (new URL(url).pathname === "/hash") {
			return Response.json({ hash: `$argon2id$fake$${body.password}` });
		}
		return Response.json({ valid: body.hash === `$argon2id$fake$${body.password}` });
	});
	return { fetch } as unknown as Fetcher;
}

const GRANTS = [
	{ clientScopeId: "cs-read", scopeId: "s-read", scopeName: "read" },
	{ clientScopeId: "cs-write", scopeId: "s-write", scopeName: "write" },
];

function createClient(overrides: Partial<Client> = {}): Client {
	return {
		id: "client-row-1",
		clientId: "cid_public",
		clientSecret: "h1:abc",
		environmentId: "env-1",
		createdBy: "admin",
		expiresAt: null,
		name: "CI client",
		tokenEndpointAuthMethod: "client_secret_basic",
		isDynamic: false,
		isTest: false,
		...overrides,
	};
}

function createUser(overrides: Partial<UserRecord> = {}): UserRecord {
	return {
		id: "user-1",
		username: "ci-bot",
		name: "CI Bot",
		email: null,
		emailVerifiedAt: null,
		avatarKey: null,
		isAdmin: false,
		isTestUser: false,
		...overrides,
	};
}

function createStoredKey(overrides: Partial<ApiKeyWithHash> = {}): ApiKeyWithHash {
	return {
		id: "key-row-1",
		keyId: "aaaaaaaaaaaaaaaa",
		keyHash: "$argon2id$fake$secret",
		clientId: "client-row-1",
		userId: "user-1",
		userDisplay: "ci-bot",
		name: "deploy",
		createdBy: "admin",
		createdAt: "2026-01-01T00:00:00.000Z",
		expiresAt: null,
		revokedAt: null,
		lastUsedAt: null,
		...overrides,
	};
}

interface Harness {
	service: ApiKeyService;
	apiKeyRepo: ApiKeyRepository;
	clientRepo: ClientRepository;
	userRepo: UserRepository;
	tokenRepo: TokenRepository;
	auditInsert: ReturnType<typeof vi.fn>;
	mailSend: ReturnType<typeof vi.fn>;
}

function createHarness(options: { argonHasher?: Fetcher | undefined } = {}): Harness {
	const apiKeyRepo = {
		listByClient: vi.fn().mockResolvedValue([]),
		getById: vi.fn().mockResolvedValue(null),
		getByKeyId: vi.fn().mockResolvedValue(null),
		create: vi.fn(),
		revoke: vi.fn(),
		updateHash: vi.fn(),
		touchLastUsed: vi.fn(),
		getScopeGrants: vi.fn().mockResolvedValue([]),
	} as unknown as ApiKeyRepository;

	const clientRepo = {
		getById: vi.fn().mockResolvedValue(createClient()),
	} as unknown as ClientRepository;

	const userRepo = {
		getById: vi.fn().mockResolvedValue(createUser()),
		// The client fixture lives in env-1, so the bound user has access by default.
		getUserEnvironments: vi.fn().mockResolvedValue(["env-1"]),
	} as unknown as UserRepository;

	const tokenRepo = {
		getClientScopeGrants: vi.fn().mockResolvedValue(GRANTS),
	} as unknown as TokenRepository;

	const auditInsert = vi.fn();
	const logRepo: AdminAuditLogRepository = { insert: auditInsert, listLogs: vi.fn() };

	// Only the self-service create path touches these.
	const mailSend = vi.fn().mockResolvedValue(undefined);
	const mail = {
		send: mailSend,
		fromAddress: () => "no-reply@auth.example",
	} as unknown as ConstructorParameters<typeof ApiKeyService>[0]["mail"];
	const siteRepo = {
		get: vi.fn().mockResolvedValue({
			siteUrl: "https://auth.example",
			siteTitle: "Example Auth",
			logoKey: null,
			cdnUrl: null,
		}),
	} as unknown as ConstructorParameters<typeof ApiKeyService>[0]["siteRepo"];
	const siteSettings = {
		getDisplaySiteTitle: (title?: string | null) => title ?? "Example Auth",
		getEmailLogoAbsoluteUrl: () => "https://auth.example/logo.png",
	} as unknown as ConstructorParameters<typeof ApiKeyService>[0]["siteSettings"];

	const service = new ApiKeyService({
		apiKeyRepo,
		clientRepo,
		userRepo,
		tokenRepo,
		adminAuditLogService: new AdminAuditLogService({ logRepo }),
		argonHasher: "argonHasher" in options ? options.argonHasher : createArgonHasherMock(),
		mail,
		siteRepo,
		siteSettings,
	});

	return { service, apiKeyRepo, clientRepo, userRepo, tokenRepo, auditInsert, mailSend };
}

describe("ApiKeyService", () => {
	let harness: Harness;

	beforeEach(() => {
		harness = createHarness();
	});

	describe("create with notifyUser (self-service)", () => {
		it("emails the bound user, naming the key but never the secret", async () => {
			const { service, apiKeyRepo, userRepo, mailSend } = harness;
			vi.mocked(userRepo.getById).mockResolvedValue(createUser({ email: "ci@example.com" }));
			vi.mocked(apiKeyRepo.getById).mockResolvedValue(createStoredKey({ name: "deploy" }));

			const result = await service.create(
				{ clientRowId: "client-row-1", userId: "user-1", scopeNames: ["read"], notifyUser: true },
				"user-1"
			);

			expect(mailSend).toHaveBeenCalledTimes(1);
			const [message] = mailSend.mock.calls[0];
			expect(message.to).toBe("ci@example.com");
			expect(message.subject).toContain("New API key created");
			// The public handle is fine to email; the credential is not.
			expect(message.html).toContain("aaaaaaaaaaaaaaaa");
			const [, , secret] = result.presentedKey.split("_");
			expect(message.html).not.toContain(secret);
			expect(message.text).not.toContain(secret);
			expect(message.html).toContain("read");
		});

		it("refuses before writing anything when the user has no email address", async () => {
			const { service, apiKeyRepo, mailSend } = harness;

			await expect(
				service.create(
					{ clientRowId: "client-row-1", userId: "user-1", notifyUser: true },
					"user-1"
				)
			).rejects.toThrow(/has no email address/u);

			// The check runs before any write, so there is no key to roll back.
			expect(apiKeyRepo.create).not.toHaveBeenCalled();
			expect(mailSend).not.toHaveBeenCalled();
		});

		it("revokes the key and fails when the notification cannot be delivered", async () => {
			const { service, apiKeyRepo, userRepo, mailSend } = harness;
			vi.mocked(userRepo.getById).mockResolvedValue(createUser({ email: "ci@example.com" }));
			vi.mocked(apiKeyRepo.getById).mockResolvedValue(createStoredKey());
			mailSend.mockRejectedValue(new Error("Resend error (application_error): down"));

			// A key nobody could be told about must not stay usable -- otherwise a stolen
			// access token could mint a long-lived credential in silence.
			await expect(
				service.create(
					{ clientRowId: "client-row-1", userId: "user-1", notifyUser: true },
					"user-1"
				)
			).rejects.toThrow(/notification could not be sent, so the key was revoked/u);

			// Revoked by the row id that was just inserted, not the fixture's.
			const [insertedRow] = vi.mocked(apiKeyRepo.create).mock.calls[0];
			expect(apiKeyRepo.revoke).toHaveBeenCalledWith(insertedRow.id, expect.any(String));
		});

		it("does not email at all on the ordinary admin path", async () => {
			const { service, apiKeyRepo, userRepo, mailSend } = harness;
			vi.mocked(userRepo.getById).mockResolvedValue(createUser({ email: "ci@example.com" }));
			vi.mocked(apiKeyRepo.getById).mockResolvedValue(createStoredKey());

			await service.create({ clientRowId: "client-row-1", userId: "user-1" }, "admin");

			expect(mailSend).not.toHaveBeenCalled();
		});

		it("creates the key for a user with no email when notification is not requested", async () => {
			const { service, apiKeyRepo } = harness;
			vi.mocked(apiKeyRepo.getById).mockResolvedValue(createStoredKey());

			// An admin issuing a key for a service account must not be blocked by a missing
			// address -- the precondition belongs to the self-service path only.
			await expect(
				service.create({ clientRowId: "client-row-1", userId: "user-1" }, "admin")
			).resolves.toMatchObject({ presentedKey: expect.any(String) });
		});
	});

	describe("list and lookup confined to a user", () => {
		const mine = createStoredKey({ id: "key-mine", keyId: "1111111111111111", userId: "user-1" });
		const theirs = createStoredKey({ id: "key-theirs", keyId: "2222222222222222", userId: "user-2" });

		it("returns every key for an unconfined caller", async () => {
			const { service, apiKeyRepo } = harness;
			vi.mocked(apiKeyRepo.listByClient).mockResolvedValue([mine, theirs]);

			expect(await service.list("client-row-1")).toHaveLength(2);
			// An explicitly absent filter is not a filter.
			expect(await service.list("client-row-1", { userId: null })).toHaveLength(2);
		});

		it("returns only the confined user's keys", async () => {
			const { service, apiKeyRepo } = harness;
			vi.mocked(apiKeyRepo.listByClient).mockResolvedValue([mine, theirs]);

			const keys = await service.list("client-row-1", { userId: "user-1" });
			expect(keys.map((k) => k.id)).toEqual(["key-mine"]);
		});

		it("hides another user's key from a confined lookup", async () => {
			const { service, apiKeyRepo } = harness;
			vi.mocked(apiKeyRepo.listByClient).mockResolvedValue([mine, theirs]);

			expect(
				await service.getByKeyIdForClientAndUser("client-row-1", "1111111111111111", "user-1")
			).toMatchObject({ id: "key-mine" });
			// Same handle, wrong owner: null, so the route answers 404 rather than revealing it.
			expect(
				await service.getByKeyIdForClientAndUser("client-row-1", "2222222222222222", "user-1")
			).toBeNull();
		});
	});

	describe("create", () => {
		it("returns the credential once and stores only its hashed secret half", async () => {
			const { service, apiKeyRepo } = harness;
			vi.mocked(apiKeyRepo.getById).mockResolvedValue(createStoredKey());

			const result = await service.create({ clientRowId: "client-row-1", userId: "user-1" }, "admin");

			expect(result.presentedKey).toMatch(/^eak_[0-9a-f]{16}_[0-9a-f]{64}$/u);
			const [row] = vi.mocked(apiKeyRepo.create).mock.calls[0];
			const [, keyId, secret] = result.presentedKey.split("_");
			expect(row.key_id).toBe(keyId);
			// The digest covers the secret half only...
			expect(row.key_hash).toBe(`$argon2id$fake$${secret}`);
			// ...and no other column carries the plaintext. (key_hash is excluded because this
			// fake hasher embeds the plaintext by design; real Argon2 output is one-way.)
			const withoutDigest = Object.entries(row).filter(([column]) => column !== "key_hash");
			expect(JSON.stringify(withoutDigest)).not.toContain(secret);
		});

		it("materializes every client scope when none are requested", async () => {
			const { service, apiKeyRepo } = harness;
			vi.mocked(apiKeyRepo.getById).mockResolvedValue(createStoredKey());

			await service.create({ clientRowId: "client-row-1", userId: "user-1" }, "admin");

			const [, clientScopeIds] = vi.mocked(apiKeyRepo.create).mock.calls[0];
			expect(clientScopeIds).toEqual(["cs-read", "cs-write"]);
		});

		it("narrows to the requested subset", async () => {
			const { service, apiKeyRepo } = harness;
			vi.mocked(apiKeyRepo.getById).mockResolvedValue(createStoredKey());

			await service.create(
				{ clientRowId: "client-row-1", userId: "user-1", scopeNames: ["read"] },
				"admin"
			);

			const [, clientScopeIds] = vi.mocked(apiKeyRepo.create).mock.calls[0];
			expect(clientScopeIds).toEqual(["cs-read"]);
		});

		it("deduplicates repeated scope names", async () => {
			const { service, apiKeyRepo } = harness;
			vi.mocked(apiKeyRepo.getById).mockResolvedValue(createStoredKey());

			await service.create(
				{ clientRowId: "client-row-1", userId: "user-1", scopeNames: ["read", "read"] },
				"admin"
			);

			// api_key_scopes is UNIQUE(api_key_id, client_scope_id): a repeat would abort the
			// insert after the key row was already written.
			const [, clientScopeIds] = vi.mocked(apiKeyRepo.create).mock.calls[0];
			expect(clientScopeIds).toEqual(["cs-read"]);
		});

		it("normalizes an offset expiry to canonical UTC", async () => {
			const { service, apiKeyRepo } = harness;
			vi.mocked(apiKeyRepo.getById).mockResolvedValue(createStoredKey());

			await service.create(
				{
					clientRowId: "client-row-1",
					userId: "user-1",
					expiresAt: "2026-08-29T01:00:00+10:00",
				},
				"admin"
			);

			// Stored verbatim, this string sorts AFTER a Zulu "now" of 2026-08-28T20:00:00Z,
			// so authenticate()'s lexicographic comparison would keep honouring an expired key.
			const [row] = vi.mocked(apiKeyRepo.create).mock.calls[0];
			expect(row.expires_at).toBe("2026-08-28T15:00:00.000Z");
		});

		it("refuses a scope the client was never granted", async () => {
			const { service } = harness;
			await expect(
				service.create(
					{ clientRowId: "client-row-1", userId: "user-1", scopeNames: ["admin"] },
					"admin"
				)
			).rejects.toThrow(/Scope not granted/u);
		});

		it("rejects an unknown client and an unknown user", async () => {
			const { service, clientRepo, userRepo } = harness;
			vi.mocked(clientRepo.getById).mockResolvedValueOnce(null);
			await expect(
				service.create({ clientRowId: "nope", userId: "user-1" }, "admin")
			).rejects.toThrow("Client not found");

			vi.mocked(userRepo.getById).mockResolvedValueOnce(null);
			await expect(
				service.create({ clientRowId: "client-row-1", userId: "nope" }, "admin")
			).rejects.toThrow("User not found");
		});

		it("refuses to bind a test user to a non-test client", async () => {
			const { service, userRepo } = harness;
			vi.mocked(userRepo.getById).mockResolvedValue(createUser({ isTestUser: true }));

			await expect(
				service.create({ clientRowId: "client-row-1", userId: "user-1" }, "admin")
			).rejects.toThrow(/test user can only be bound to a test client/u);
		});

		it("rejects an unparseable expiry", async () => {
			const { service } = harness;
			await expect(
				service.create(
					{ clientRowId: "client-row-1", userId: "user-1", expiresAt: "next tuesday" },
					"admin"
				)
			).rejects.toThrow(/valid ISO timestamp/u);
		});

		it("audits the creation without recording the secret", async () => {
			const { service, apiKeyRepo, auditInsert } = harness;
			vi.mocked(apiKeyRepo.getById).mockResolvedValue(createStoredKey());

			const result = await service.create(
				{ clientRowId: "client-row-1", userId: "user-1", scopeNames: ["read"] },
				"admin"
			);

			const [auditRow] = auditInsert.mock.calls[0];
			expect(auditRow).toMatchObject({ action: "api_key.create", resource_type: "api_key" });
			expect(auditRow.details).toContain('"read"');
			const secret = result.presentedKey.split("_")[2];
			expect(auditRow.details).not.toContain(secret);
		});

		it("fails closed when argon is in force but the hashing service is unavailable", async () => {
			// Defaulting to argon (rather than degrading to MD5) is what makes a missing
			// binding an error instead of a silently weaker digest.
			const { service } = createHarness({ argonHasher: undefined });
			await expect(
				service.create({ clientRowId: "client-row-1", userId: "user-1" }, "admin")
			).rejects.toThrow(/ARGON_HASHER/u);
		});
	});

	describe("revoke", () => {
		it("stamps the row and audits it", async () => {
			const { service, apiKeyRepo, auditInsert } = harness;
			vi.mocked(apiKeyRepo.getById).mockResolvedValue(createStoredKey());

			await service.revoke("key-row-1", "admin");

			expect(apiKeyRepo.revoke).toHaveBeenCalledWith("key-row-1", expect.any(String));
			expect(auditInsert.mock.calls[0][0]).toMatchObject({ action: "api_key.revoke" });
		});

		it("returns null for an unknown key", async () => {
			const { service, apiKeyRepo } = harness;
			expect(await service.revoke("nope", "admin")).toBeNull();
			expect(apiKeyRepo.revoke).not.toHaveBeenCalled();
		});

		it("is a no-op on an already-revoked key, so the first timestamp stands", async () => {
			const { service, apiKeyRepo, auditInsert } = harness;
			vi.mocked(apiKeyRepo.getById).mockResolvedValue(
				createStoredKey({ revokedAt: "2026-01-02T00:00:00.000Z" })
			);

			await service.revoke("key-row-1", "admin");

			expect(apiKeyRepo.revoke).not.toHaveBeenCalled();
			expect(auditInsert).not.toHaveBeenCalled();
		});
	});

	describe("authenticate", () => {
		/** Seeds the repo with a key whose stored digest matches `presented`. */
		function seedValidKey(h: Harness, overrides: Partial<ApiKeyWithHash> = {}) {
			const generated = generateApiKey();
			vi.mocked(h.apiKeyRepo.getByKeyId).mockResolvedValue(
				createStoredKey({
					keyId: generated.keyId,
					keyHash: `$argon2id$fake$${generated.secret}`,
					...overrides,
				})
			);
			vi.mocked(h.apiKeyRepo.getScopeGrants).mockResolvedValue(GRANTS);
			return generated.presented;
		}

		it("resolves the key, client, user and scope snapshot", async () => {
			const presented = seedValidKey(harness);

			const result = await harness.service.authenticate(presented);

			expect(result.user.id).toBe("user-1");
			expect(result.client.clientId).toBe("cid_public");
			expect(result.scopeGrants).toEqual(GRANTS);
			// The digest must not ride along on the returned key.
			expect(result.apiKey).not.toHaveProperty("keyHash");
		});

		it("never falls back to the client's current scopes when the snapshot is empty", async () => {
			const presented = seedValidKey(harness);
			vi.mocked(harness.apiKeyRepo.getScopeGrants).mockResolvedValue([]);

			const result = await harness.service.authenticate(presented);

			// Every scope this key held was ungranted and cascaded away. Minting the client's
			// current set here would silently re-widen a deliberately narrowed key.
			expect(result.scopeGrants).toEqual([]);
			expect(harness.tokenRepo.getClientScopeGrants).not.toHaveBeenCalled();
		});

		it("does not spend Argon2 work on a malformed key", async () => {
			await expect(harness.service.authenticate("not-a-key")).rejects.toThrow("Invalid API key.");
			expect(harness.apiKeyRepo.getByKeyId).not.toHaveBeenCalled();
		});

		it("rejects an unknown handle", async () => {
			const { presented } = generateApiKey();
			vi.mocked(harness.apiKeyRepo.getByKeyId).mockResolvedValue(null);
			await expect(harness.service.authenticate(presented)).rejects.toThrow("Invalid API key.");
		});

		it("rejects the right handle with the wrong secret", async () => {
			seedValidKey(harness);
			const impostor = generateApiKey();
			await expect(harness.service.authenticate(impostor.presented)).rejects.toThrow(
				"Invalid API key."
			);
		});

		it("rejects a revoked key", async () => {
			const presented = seedValidKey(harness, { revokedAt: "2026-01-02T00:00:00.000Z" });
			await expect(harness.service.authenticate(presented)).rejects.toThrow("Invalid API key.");
		});

		it("rejects an expired key but accepts one expiring later", async () => {
			const past = seedValidKey(harness, { expiresAt: "2000-01-01T00:00:00.000Z" });
			await expect(harness.service.authenticate(past)).rejects.toThrow("Invalid API key.");

			const future = seedValidKey(harness, { expiresAt: "2999-01-01T00:00:00.000Z" });
			await expect(harness.service.authenticate(future)).resolves.toMatchObject({
				client: { clientId: "cid_public" },
			});
		});

		it("rejects a key whose client has expired", async () => {
			const presented = seedValidKey(harness);
			vi.mocked(harness.clientRepo.getById).mockResolvedValue(
				createClient({ expiresAt: "2000-01-01T00:00:00.000Z" })
			);
			await expect(harness.service.authenticate(presented)).rejects.toThrow("Invalid API key.");
		});

		it("rejects a test user against a non-test client", async () => {
			const presented = seedValidKey(harness);
			vi.mocked(harness.userRepo.getById).mockResolvedValue(createUser({ isTestUser: true }));
			await expect(harness.service.authenticate(presented)).rejects.toThrow("Invalid API key.");

			// ...and allows it once the client is a test client.
			vi.mocked(harness.clientRepo.getById).mockResolvedValue(createClient({ isTest: true }));
			await expect(harness.service.authenticate(presented)).resolves.toMatchObject({
				user: { isTestUser: true },
			});
		});

		it("rejects once the user loses access to the client's environment", async () => {
			const presented = seedValidKey(harness);
			await expect(harness.service.authenticate(presented)).resolves.toBeDefined();

			// Revoking environment access must stop the key immediately -- an API key
			// outlives the refresh token that already gets this re-check.
			vi.mocked(harness.userRepo.getUserEnvironments).mockResolvedValue(["some-other-env"]);
			await expect(harness.service.authenticate(presented)).rejects.toThrow("Invalid API key.");
		});

		it("reports every failure as the same 401 invalid_client, giving away nothing", async () => {
			const cases = [
				async () => harness.service.authenticate("garbage"),
				async () => {
					vi.mocked(harness.apiKeyRepo.getByKeyId).mockResolvedValue(null);
					return harness.service.authenticate(generateApiKey().presented);
				},
				async () => {
					const presented = seedValidKey(harness, { revokedAt: "2026-01-02T00:00:00.000Z" });
					return harness.service.authenticate(presented);
				},
			];

			for (const run of cases) {
				const error = await run().catch((e: unknown) => e);
				expect(isOAuthServiceError(error)).toBe(true);
				expect(error).toMatchObject({ code: "invalid_client", status: 401 });
				expect((error as Error).message).toBe("Invalid API key.");
			}
		});
	});
});
