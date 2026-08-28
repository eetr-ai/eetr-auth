import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Scope, ScopeRepository } from "@/lib/repositories/scope.repository";
import type { AdminAuditLogRepository } from "@/lib/repositories/admin-audit-log.repository";
import { ScopeService } from "@/lib/services/scope.service";
import { AdminAuditLogService } from "@/lib/services/admin-audit-log.service";

function createScopeRepoMock(): ScopeRepository {
	return {
		list: vi.fn(),
		getById: vi.fn(),
		listByNames: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
		countClientScopes: vi.fn(),
	};
}

function createAuditLogService(insert = vi.fn()): AdminAuditLogService {
	const logRepo: AdminAuditLogRepository = { insert, listLogs: vi.fn() };
	return new AdminAuditLogService({ logRepo });
}

function createService(
	scopeRepo: ScopeRepository,
	adminAuditLogService: AdminAuditLogService = createAuditLogService()
): ScopeService {
	return new ScopeService({ scopeRepo, adminAuditLogService });
}

describe("ScopeService", () => {
	let mockRepo: ScopeRepository;

	beforeEach(() => {
		mockRepo = createScopeRepoMock();
		vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("new-scope-id");
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	function makeScope(overrides?: Partial<Scope>): Scope {
		return {
			id: "scope-1",
			scopeName: "read:users",
			displayName: null,
			description: null,
			...overrides,
		};
	}

	describe("list", () => {
		it("returns all scopes from the repo", async () => {
			vi.mocked(mockRepo.list).mockResolvedValue([makeScope(), makeScope({ id: "scope-2", scopeName: "write:users" })]);
			const service = createService(mockRepo);
			await expect(service.list()).resolves.toHaveLength(2);
		});
	});

	describe("getById", () => {
		it("returns null when the scope does not exist", async () => {
			vi.mocked(mockRepo.getById).mockResolvedValue(null);
			const service = createService(mockRepo);
			await expect(service.getById("missing")).resolves.toBeNull();
		});

		it("returns the scope when found", async () => {
			vi.mocked(mockRepo.getById).mockResolvedValue(makeScope());
			const service = createService(mockRepo);
			await expect(service.getById("scope-1")).resolves.toEqual(makeScope());
		});
	});

	describe("listByNames", () => {
		it("delegates to the repo so consent copy can be resolved per request", async () => {
			vi.mocked(mockRepo.listByNames).mockResolvedValue([makeScope()]);
			const service = createService(mockRepo);
			await expect(service.listByNames(["read:users"])).resolves.toEqual([makeScope()]);
			expect(mockRepo.listByNames).toHaveBeenCalledWith(["read:users"]);
		});
	});

	describe("create", () => {
		it("creates a scope with a generated UUID and trimmed name", async () => {
			const service = createService(mockRepo);
			const result = await service.create("  read:users  ");
			expect(mockRepo.create).toHaveBeenCalledWith("new-scope-id", "read:users", {
				displayName: null,
				description: null,
			});
			expect(result).toEqual({
				id: "new-scope-id",
				scopeName: "read:users",
				displayName: null,
				description: null,
			});
		});

		it("trims consent copy and stores it alongside the name", async () => {
			const service = createService(mockRepo);
			const result = await service.create("read:users", {
				displayName: "  Your users  ",
				description: "  See the users in your account.  ",
			});
			expect(mockRepo.create).toHaveBeenCalledWith("new-scope-id", "read:users", {
				displayName: "Your users",
				description: "See the users in your account.",
			});
			expect(result.displayName).toBe("Your users");
		});

		it("collapses blank consent copy to null so 'no copy' has one representation", async () => {
			const service = createService(mockRepo);
			await service.create("read:users", { displayName: "   ", description: "" });
			expect(mockRepo.create).toHaveBeenCalledWith("new-scope-id", "read:users", {
				displayName: null,
				description: null,
			});
		});

		it("writes a scope.create audit entry attributed to the actor", async () => {
			const insert = vi.fn();
			const service = createService(mockRepo, createAuditLogService(insert));
			await service.create("  read:users  ", {}, "admin-1");
			expect(insert).toHaveBeenCalledWith(
				expect.objectContaining({
					actor_user_id: "admin-1",
					action: "scope.create",
					resource_type: "scope",
					resource_id: "new-scope-id",
					details: JSON.stringify({
						scopeName: "read:users",
						displayName: null,
						description: null,
					}),
				})
			);
		});
	});

	describe("update", () => {
		it("returns null when the scope does not exist", async () => {
			vi.mocked(mockRepo.getById).mockResolvedValue(null);
			const service = createService(mockRepo);
			await expect(service.update("missing", { displayName: "x", description: null })).resolves.toBeNull();
			expect(mockRepo.update).not.toHaveBeenCalled();
		});

		it("updates only the consent copy, never the protocol scope name", async () => {
			vi.mocked(mockRepo.getById).mockResolvedValue(makeScope());
			const service = createService(mockRepo);
			const result = await service.update("scope-1", {
				displayName: "  Your users  ",
				description: null,
			});
			expect(mockRepo.update).toHaveBeenCalledWith("scope-1", {
				displayName: "Your users",
				description: null,
			});
			expect(result?.scopeName).toBe("read:users");
		});

		it("writes a scope.update audit entry capturing both sides of the change", async () => {
			vi.mocked(mockRepo.getById).mockResolvedValue(
				makeScope({ displayName: "Old label", description: "Old copy." })
			);
			const insert = vi.fn();
			const service = createService(mockRepo, createAuditLogService(insert));
			await service.update("scope-1", { displayName: "New label", description: null }, "admin-1");
			expect(insert).toHaveBeenCalledWith(
				expect.objectContaining({
					actor_user_id: "admin-1",
					action: "scope.update",
					resource_type: "scope",
					resource_id: "scope-1",
					details: JSON.stringify({
						scopeName: "read:users",
						from: { displayName: "Old label", description: "Old copy." },
						to: { displayName: "New label", description: null },
					}),
				})
			);
		});
	});

	describe("delete", () => {
		it("returns an error when the scope is assigned to clients", async () => {
			vi.mocked(mockRepo.countClientScopes).mockResolvedValue(2);
			const insert = vi.fn();
			const service = createService(mockRepo, createAuditLogService(insert));
			const result = await service.delete("scope-1");
			expect(result).toEqual({ ok: false, error: "Cannot delete scope that is assigned to clients" });
			expect(mockRepo.delete).not.toHaveBeenCalled();
			expect(insert).not.toHaveBeenCalled();
		});

		it("deletes the scope when no clients use it", async () => {
			vi.mocked(mockRepo.countClientScopes).mockResolvedValue(0);
			const service = createService(mockRepo);
			const result = await service.delete("scope-1");
			expect(result).toEqual({ ok: true });
			expect(mockRepo.delete).toHaveBeenCalledWith("scope-1");
		});

		it("writes a scope.delete audit entry capturing the prior name", async () => {
			vi.mocked(mockRepo.countClientScopes).mockResolvedValue(0);
			vi.mocked(mockRepo.getById).mockResolvedValue(makeScope({ scopeName: "read:users" }));
			const insert = vi.fn();
			const service = createService(mockRepo, createAuditLogService(insert));
			await service.delete("scope-1", "admin-1");
			expect(insert).toHaveBeenCalledWith(
				expect.objectContaining({
					actor_user_id: "admin-1",
					action: "scope.delete",
					resource_type: "scope",
					resource_id: "scope-1",
					details: JSON.stringify({ scopeName: "read:users" }),
				})
			);
		});
	});
});
