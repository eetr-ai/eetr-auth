import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Scope, ScopeRepository } from "@/lib/repositories/scope.repository";
import { ScopeService } from "@/lib/services/scope.service";

vi.mock("@/lib/db", () => ({ getDb: vi.fn().mockReturnValue({}) }));

vi.mock("@/lib/repositories/scope.repository.d1", () => ({
	ScopeRepositoryD1: vi.fn(),
}));

import { ScopeRepositoryD1 } from "@/lib/repositories/scope.repository.d1";

function createScopeRepoMock(): ScopeRepository {
	return {
		list: vi.fn(),
		getById: vi.fn(),
		create: vi.fn(),
		delete: vi.fn(),
		countClientScopes: vi.fn(),
	};
}

function makeCtx() {
	return { env: {} as unknown as CloudflareEnv };
}

describe("ScopeService", () => {
	let mockRepo: ScopeRepository;

	beforeEach(() => {
		mockRepo = createScopeRepoMock();
		vi.mocked(ScopeRepositoryD1).mockImplementation(function () {
			return mockRepo;
		} as unknown as typeof ScopeRepositoryD1);
		vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("new-scope-id");
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	function makeScope(overrides?: Partial<Scope>): Scope {
		return { id: "scope-1", scopeName: "read:users", ...overrides };
	}

	describe("list", () => {
		it("returns all scopes from the repo", async () => {
			vi.mocked(mockRepo.list).mockResolvedValue([makeScope(), makeScope({ id: "scope-2", scopeName: "write:users" })]);
			const service = new ScopeService(makeCtx());
			await expect(service.list()).resolves.toHaveLength(2);
		});
	});

	describe("getById", () => {
		it("returns null when the scope does not exist", async () => {
			vi.mocked(mockRepo.getById).mockResolvedValue(null);
			const service = new ScopeService(makeCtx());
			await expect(service.getById("missing")).resolves.toBeNull();
		});

		it("returns the scope when found", async () => {
			vi.mocked(mockRepo.getById).mockResolvedValue(makeScope());
			const service = new ScopeService(makeCtx());
			await expect(service.getById("scope-1")).resolves.toEqual(makeScope());
		});
	});

	describe("create", () => {
		it("creates a scope with a generated UUID and trimmed name", async () => {
			const service = new ScopeService(makeCtx());
			const result = await service.create("  read:users  ");
			expect(mockRepo.create).toHaveBeenCalledWith("new-scope-id", "read:users");
			expect(result).toEqual({ id: "new-scope-id", scopeName: "read:users" });
		});
	});

	describe("delete", () => {
		it("returns an error when the scope is assigned to clients", async () => {
			vi.mocked(mockRepo.countClientScopes).mockResolvedValue(2);
			const service = new ScopeService(makeCtx());
			const result = await service.delete("scope-1");
			expect(result).toEqual({ ok: false, error: "Cannot delete scope that is assigned to clients" });
			expect(mockRepo.delete).not.toHaveBeenCalled();
		});

		it("deletes the scope when no clients use it", async () => {
			vi.mocked(mockRepo.countClientScopes).mockResolvedValue(0);
			const service = new ScopeService(makeCtx());
			const result = await service.delete("scope-1");
			expect(result).toEqual({ ok: true });
			expect(mockRepo.delete).toHaveBeenCalledWith("scope-1");
		});
	});
});
