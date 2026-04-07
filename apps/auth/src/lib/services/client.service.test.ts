import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Client, ClientRepository } from "@/lib/repositories/client.repository";
import { ClientService } from "@/lib/services/client.service";

function createClientRepoMock() {
	return {
		list: vi.fn(),
		getById: vi.fn(),
		getByClientIdentifier: vi.fn(),
		create: vi.fn(),
		delete: vi.fn(),
		getRedirectUris: vi.fn(),
		setRedirectUris: vi.fn(),
		getClientScopes: vi.fn(),
		setClientScopes: vi.fn(),
		updateSecret: vi.fn(),
		updateName: vi.fn(),
	} satisfies ClientRepository;
}

function createService(repo?: ClientRepository, env?: CloudflareEnv) {
	return new ClientService({
		clientRepo: repo ?? createClientRepoMock(),
		env:
			env ??
			({
				CLIENT_KEY_PREFIX: "progression",
				HMAC_KEY: "super-hmac-key",
			} as unknown as CloudflareEnv),
	});
}

function makeClient(overrides?: Partial<Client>): Client {
	return {
		id: "client-row-1",
		clientId: "progression_aaaaaaaaaaaaaaaaaaaaaaaa",
		clientSecret: "h1:stored-secret",
		environmentId: "env-1",
		createdBy: "user-1",
		expiresAt: null,
		name: "Primary Client",
		...overrides,
	};
}

describe("ClientService", () => {
	beforeEach(() => {
		vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("client-row-1");
		vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(<T extends ArrayBufferView | null>(typedArray: T): T => {
			if (!typedArray) {
				return typedArray;
			}

			const bytes = new Uint8Array(
				typedArray.buffer,
				typedArray.byteOffset,
				typedArray.byteLength
			);

			for (let index = 0; index < bytes.length; index += 1) {
				bytes[index] = index;
			}

			return typedArray;
		});
		vi.spyOn(Math, "random").mockReturnValue(0);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("creates a client id using the configured prefix", async () => {
		const repo = createClientRepoMock();
		repo.getById.mockResolvedValue(makeClient());
		repo.getRedirectUris.mockResolvedValue([]);
		repo.getClientScopes.mockResolvedValue([]);
		const service = createService(repo);

		const result = await service.create({
			environmentId: "env-1",
			createdBy: "user-1",
		});

		expect(repo.create).toHaveBeenCalledWith(
			expect.objectContaining({
				id: "client-row-1",
				client_id: "progression_aaaaaaaaaaaaaaaaaaaaaaaa",
				environment_id: "env-1",
				created_by: "user-1",
			})
		);
		expect(result.client.clientId).toBe("progression_aaaaaaaaaaaaaaaaaaaaaaaa");
	});

	it("stores the generated secret as an h1 hash when HMAC_KEY is configured", async () => {
		const repo = createClientRepoMock();
		repo.getById.mockResolvedValue(makeClient());
		repo.getRedirectUris.mockResolvedValue([]);
		repo.getClientScopes.mockResolvedValue([]);
		const service = createService(repo);

		const result = await service.create({
			environmentId: "env-1",
			createdBy: "user-1",
		});

		const storedSecret = repo.create.mock.calls[0]?.[0]?.client_secret as string;
		expect(result.clientSecret).toBe("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f");
		expect(storedSecret).toMatch(/^h1:[0-9a-f]{64}$/);
		expect(storedSecret).not.toContain(result.clientSecret);
	});

	it("persists redirect URIs and scope ids when provided", async () => {
		const repo = createClientRepoMock();
		repo.getById.mockResolvedValue(makeClient());
		repo.getRedirectUris.mockResolvedValue(["https://client.example.com/callback"]);
		repo.getClientScopes.mockResolvedValue([{ scopeId: "scope-read" }]);
		const service = createService(repo);

		await service.create({
			environmentId: "env-1",
			createdBy: "user-1",
			redirectUris: ["https://client.example.com/callback", "   "],
			scopeIds: ["scope-read", ""],
		});

		expect(repo.setRedirectUris).toHaveBeenCalledWith("client-row-1", ["https://client.example.com/callback"]);
		expect(repo.setClientScopes).toHaveBeenCalledWith("client-row-1", ["scope-read"]);
	});

	it("rotates the client secret and returns the new plaintext value", async () => {
		const repo = createClientRepoMock();
		repo.getById
			.mockResolvedValueOnce(makeClient())
			.mockResolvedValueOnce(makeClient({ clientSecret: "h1:new-stored-secret" }));
		const service = createService(repo);

		const result = await service.rotateSecret("client-row-1");

		expect(repo.updateSecret).toHaveBeenCalledWith("client-row-1", expect.stringMatching(/^h1:[0-9a-f]{64}$/));
		expect(result).toEqual({
			client: makeClient({ clientSecret: "h1:new-stored-secret" }),
			clientSecret: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
		});
	});

	it("throws when HMAC_KEY is missing during client creation", async () => {
		const service = createService(createClientRepoMock(), { CLIENT_KEY_PREFIX: "progression" } as unknown as CloudflareEnv);

		await expect(
			service.create({
				environmentId: "env-1",
				createdBy: "user-1",
			})
		).rejects.toThrow(
			"HMAC_KEY is required to create OAuth clients (set in Wrangler secrets or .dev.vars)."
		);
	});
});