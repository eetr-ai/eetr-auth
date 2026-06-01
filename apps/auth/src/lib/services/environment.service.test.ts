import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Environment, EnvironmentRepository } from "@/lib/repositories/environment.repository";
import type { AdminAuditLogRepository } from "@/lib/repositories/admin-audit-log.repository";
import { EnvironmentService } from "@/lib/services/environment.service";
import { AdminAuditLogService } from "@/lib/services/admin-audit-log.service";

function createEnvRepoMock(): EnvironmentRepository {
	return {
		list: vi.fn(),
		getById: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
		countClientsByEnvironment: vi.fn(),
	};
}

function createAuditLogService(insert = vi.fn()): AdminAuditLogService {
	const logRepo: AdminAuditLogRepository = { insert, listLogs: vi.fn() };
	return new AdminAuditLogService({ logRepo });
}

function createService(
	envRepo: EnvironmentRepository,
	adminAuditLogService: AdminAuditLogService = createAuditLogService()
): EnvironmentService {
	return new EnvironmentService({ envRepo, adminAuditLogService });
}

describe("EnvironmentService", () => {
	let mockRepo: EnvironmentRepository;

	beforeEach(() => {
		mockRepo = createEnvRepoMock();
		vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("new-env-id");
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	function makeEnv(overrides?: Partial<Environment>): Environment {
		return { id: "env-1", name: "production", ...overrides };
	}

	describe("list", () => {
		it("returns all environments from the repo", async () => {
			vi.mocked(mockRepo.list).mockResolvedValue([makeEnv(), makeEnv({ id: "env-2", name: "staging" })]);
			const service = createService(mockRepo);
			await expect(service.list()).resolves.toHaveLength(2);
		});
	});

	describe("getById", () => {
		it("returns null when the environment does not exist", async () => {
			vi.mocked(mockRepo.getById).mockResolvedValue(null);
			const service = createService(mockRepo);
			await expect(service.getById("missing")).resolves.toBeNull();
		});

		it("returns the environment when found", async () => {
			vi.mocked(mockRepo.getById).mockResolvedValue(makeEnv());
			const service = createService(mockRepo);
			await expect(service.getById("env-1")).resolves.toEqual(makeEnv());
		});
	});

	describe("create", () => {
		it("creates an environment with a generated UUID and trimmed name", async () => {
			const service = createService(mockRepo);
			const result = await service.create("  staging  ");
			expect(mockRepo.create).toHaveBeenCalledWith("new-env-id", "staging");
			expect(result).toEqual({ id: "new-env-id", name: "staging" });
		});

		it("writes an environment.create audit entry attributed to the actor", async () => {
			const insert = vi.fn();
			const service = createService(mockRepo, createAuditLogService(insert));
			await service.create("  staging  ", "admin-1");
			expect(insert).toHaveBeenCalledWith(
				expect.objectContaining({
					actor_user_id: "admin-1",
					action: "environment.create",
					resource_type: "environment",
					resource_id: "new-env-id",
					details: JSON.stringify({ name: "staging" }),
				})
			);
		});
	});

	describe("update", () => {
		it("returns null when the environment does not exist", async () => {
			vi.mocked(mockRepo.getById).mockResolvedValue(null);
			const insert = vi.fn();
			const service = createService(mockRepo, createAuditLogService(insert));
			await expect(service.update("missing", "new-name")).resolves.toBeNull();
			expect(mockRepo.update).not.toHaveBeenCalled();
			expect(insert).not.toHaveBeenCalled();
		});

		it("updates the environment name and returns the result", async () => {
			vi.mocked(mockRepo.getById).mockResolvedValue(makeEnv());
			const service = createService(mockRepo);
			const result = await service.update("env-1", "  production  ");
			expect(mockRepo.update).toHaveBeenCalledWith("env-1", "production");
			expect(result).toEqual({ id: "env-1", name: "production" });
		});

		it("writes an environment.update audit entry with from/to names", async () => {
			vi.mocked(mockRepo.getById).mockResolvedValue(makeEnv({ name: "prod-old" }));
			const insert = vi.fn();
			const service = createService(mockRepo, createAuditLogService(insert));
			await service.update("env-1", "  production  ", "admin-1");
			expect(insert).toHaveBeenCalledWith(
				expect.objectContaining({
					actor_user_id: "admin-1",
					action: "environment.update",
					resource_type: "environment",
					resource_id: "env-1",
					details: JSON.stringify({ from: "prod-old", to: "production" }),
				})
			);
		});
	});

	describe("delete", () => {
		it("returns an error when the environment has clients assigned", async () => {
			vi.mocked(mockRepo.countClientsByEnvironment).mockResolvedValue(3);
			const insert = vi.fn();
			const service = createService(mockRepo, createAuditLogService(insert));
			const result = await service.delete("env-1");
			expect(result).toEqual({ ok: false, error: "Cannot delete environment that has clients" });
			expect(mockRepo.delete).not.toHaveBeenCalled();
			expect(insert).not.toHaveBeenCalled();
		});

		it("deletes the environment when no clients are assigned", async () => {
			vi.mocked(mockRepo.countClientsByEnvironment).mockResolvedValue(0);
			const service = createService(mockRepo);
			const result = await service.delete("env-1");
			expect(result).toEqual({ ok: true });
			expect(mockRepo.delete).toHaveBeenCalledWith("env-1");
		});

		it("writes an environment.delete audit entry capturing the prior name", async () => {
			vi.mocked(mockRepo.countClientsByEnvironment).mockResolvedValue(0);
			vi.mocked(mockRepo.getById).mockResolvedValue(makeEnv({ name: "production" }));
			const insert = vi.fn();
			const service = createService(mockRepo, createAuditLogService(insert));
			await service.delete("env-1", "admin-1");
			expect(insert).toHaveBeenCalledWith(
				expect.objectContaining({
					actor_user_id: "admin-1",
					action: "environment.delete",
					resource_type: "environment",
					resource_id: "env-1",
					details: JSON.stringify({ name: "production" }),
				})
			);
		});
	});
});
