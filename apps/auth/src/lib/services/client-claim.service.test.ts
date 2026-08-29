import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
	ClientClaim,
	ClientClaimRepository,
} from "@/lib/repositories/client-claim.repository";
import {
	ClientClaimService,
	ClientClaimValidationError,
	decodeClaimValue,
} from "@/lib/services/client-claim.service";

function createRepoMock(): ClientClaimRepository {
	return {
		listByClient: vi.fn().mockResolvedValue([]),
		setClientClaims: vi.fn(),
	};
}

function makeClaim(overrides?: Partial<ClientClaim>): ClientClaim {
	return {
		id: "cc-1",
		clientId: "c1",
		claimName: "tenant",
		claimValue: "acme",
		valueType: "string",
		...overrides,
	};
}

describe("decodeClaimValue", () => {
	it("decodes each type into its real JSON type", () => {
		expect(decodeClaimValue("acme", "string")).toBe("acme");
		expect(decodeClaimValue("3", "number")).toBe(3);
		expect(decodeClaimValue("-2.5", "number")).toBe(-2.5);
		expect(decodeClaimValue("true", "boolean")).toBe(true);
		expect(decodeClaimValue("FALSE", "boolean")).toBe(false);
		expect(decodeClaimValue('["a","b"]', "json")).toEqual(["a", "b"]);
		expect(decodeClaimValue('{"k":1}', "json")).toEqual({ k: 1 });
	});

	it("returns undefined for values that do not decode", () => {
		expect(decodeClaimValue("not-a-number", "number")).toBeUndefined();
		expect(decodeClaimValue("Infinity", "number")).toBeUndefined();
		expect(decodeClaimValue("yes", "boolean")).toBeUndefined();
		expect(decodeClaimValue("{oops", "json")).toBeUndefined();
	});
});

describe("ClientClaimService", () => {
	let repo: ClientClaimRepository;

	beforeEach(() => {
		repo = createRepoMock();
	});

	describe("setClientClaims", () => {
		it("trims names and persists the normalized set", async () => {
			const service = new ClientClaimService({ clientClaimRepo: repo });
			await service.setClientClaims("c1", [
				{ claimName: "  tenant  ", claimValue: "acme", valueType: "string" },
			]);
			expect(repo.setClientClaims).toHaveBeenCalledWith("c1", [
				{ claimName: "tenant", claimValue: "acme", valueType: "string" },
			]);
		});

		it("drops rows with an empty name rather than failing the whole save", async () => {
			const service = new ClientClaimService({ clientClaimRepo: repo });
			await service.setClientClaims("c1", [
				{ claimName: "   ", claimValue: "", valueType: "string" },
				{ claimName: "tier", claimValue: "3", valueType: "number" },
			]);
			expect(repo.setClientClaims).toHaveBeenCalledWith("c1", [
				{ claimName: "tier", claimValue: "3", valueType: "number" },
			]);
		});

		it.each(["iss", "sub", "aud", "exp", "iat", "jti", "scope", "client_id", "environment"])(
			"rejects the reserved claim %s",
			async (name) => {
				const service = new ClientClaimService({ clientClaimRepo: repo });
				await expect(
					service.setClientClaims("c1", [
						{ claimName: name, claimValue: "x", valueType: "string" },
					])
				).rejects.toBeInstanceOf(ClientClaimValidationError);
				expect(repo.setClientClaims).not.toHaveBeenCalled();
			}
		);

		it("rejects a malformed claim name", async () => {
			const service = new ClientClaimService({ clientClaimRepo: repo });
			await expect(
				service.setClientClaims("c1", [
					{ claimName: "not a name", claimValue: "x", valueType: "string" },
				])
			).rejects.toBeInstanceOf(ClientClaimValidationError);
		});

		it("rejects duplicate claim names", async () => {
			const service = new ClientClaimService({ clientClaimRepo: repo });
			await expect(
				service.setClientClaims("c1", [
					{ claimName: "tenant", claimValue: "a", valueType: "string" },
					{ claimName: "tenant", claimValue: "b", valueType: "string" },
				])
			).rejects.toBeInstanceOf(ClientClaimValidationError);
		});

		it("rejects a value that does not match its declared type, at save time", async () => {
			const service = new ClientClaimService({ clientClaimRepo: repo });
			await expect(
				service.setClientClaims("c1", [
					{ claimName: "tier", claimValue: "high", valueType: "number" },
				])
			).rejects.toBeInstanceOf(ClientClaimValidationError);
			expect(repo.setClientClaims).not.toHaveBeenCalled();
		});
	});

	describe("getTokenClaims", () => {
		it("returns decoded values keyed by claim name", async () => {
			vi.mocked(repo.listByClient).mockResolvedValue([
				makeClaim({ claimName: "tenant", claimValue: "acme", valueType: "string" }),
				makeClaim({ id: "cc-2", claimName: "tier", claimValue: "3", valueType: "number" }),
				makeClaim({ id: "cc-3", claimName: "beta", claimValue: "true", valueType: "boolean" }),
				makeClaim({
					id: "cc-4",
					claimName: "roles",
					claimValue: '["admin"]',
					valueType: "json",
				}),
			]);
			const service = new ClientClaimService({ clientClaimRepo: repo });
			await expect(service.getTokenClaims("c1")).resolves.toEqual({
				tenant: "acme",
				tier: 3,
				beta: true,
				roles: ["admin"],
			});
		});

		it("filters reserved names even when a row somehow holds one", async () => {
			// Defence in depth: the write path rejects these, but a row written directly to
			// the database must never be able to forge an issuer-owned claim in a token.
			vi.mocked(repo.listByClient).mockResolvedValue([
				makeClaim({ claimName: "sub", claimValue: "attacker", valueType: "string" }),
				makeClaim({ id: "cc-2", claimName: "scope", claimValue: "admin", valueType: "string" }),
				makeClaim({ id: "cc-3", claimName: "tenant", claimValue: "acme", valueType: "string" }),
			]);
			const service = new ClientClaimService({ clientClaimRepo: repo });
			await expect(service.getTokenClaims("c1")).resolves.toEqual({ tenant: "acme" });
		});

		it("drops a single undecodable claim instead of failing token issuance", async () => {
			vi.mocked(repo.listByClient).mockResolvedValue([
				makeClaim({ claimName: "broken", claimValue: "{oops", valueType: "json" }),
				makeClaim({ id: "cc-2", claimName: "tenant", claimValue: "acme", valueType: "string" }),
			]);
			const service = new ClientClaimService({ clientClaimRepo: repo });
			await expect(service.getTokenClaims("c1")).resolves.toEqual({ tenant: "acme" });
		});
	});
});
