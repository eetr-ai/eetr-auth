import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TokenActivityLogRepository, TokenActivityMetrics, ListLogsResult } from "@/lib/repositories/token-activity-log.repository";
import type { ClientRepository } from "@/lib/repositories/client.repository";
import type { EnvironmentRepository } from "@/lib/repositories/environment.repository";
import { TokenActivityLogService } from "@/lib/services/token-activity-log.service";

vi.mock("@/lib/db", () => ({ getDb: vi.fn().mockReturnValue({}) }));

vi.mock("@/lib/repositories/token-activity-log.repository.d1", () => ({
	TokenActivityLogRepositoryD1: vi.fn(),
}));

vi.mock("@/lib/repositories/client.repository.d1", () => ({
	ClientRepositoryD1: vi.fn(),
}));

vi.mock("@/lib/repositories/environment.repository.d1", () => ({
	EnvironmentRepositoryD1: vi.fn(),
}));

import { TokenActivityLogRepositoryD1 } from "@/lib/repositories/token-activity-log.repository.d1";
import { ClientRepositoryD1 } from "@/lib/repositories/client.repository.d1";
import { EnvironmentRepositoryD1 } from "@/lib/repositories/environment.repository.d1";

function createLogRepoMock(): TokenActivityLogRepository {
	return {
		insert: vi.fn(),
		deleteOlderThan: vi.fn(),
		getMetricsSince: vi.fn(),
		listLogs: vi.fn(),
	};
}

function createClientRepoMock(): ClientRepository {
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
	};
}

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

function makeCtx() {
	return { env: {} as unknown as CloudflareEnv };
}

describe("TokenActivityLogService", () => {
	let logRepo: TokenActivityLogRepository;
	let clientRepo: ClientRepository;
	let envRepo: EnvironmentRepository;

	beforeEach(() => {
		logRepo = createLogRepoMock();
		clientRepo = createClientRepoMock();
		envRepo = createEnvRepoMock();

		vi.mocked(TokenActivityLogRepositoryD1).mockImplementation(function () {
			return logRepo;
		} as unknown as typeof TokenActivityLogRepositoryD1);
		vi.mocked(ClientRepositoryD1).mockImplementation(function () {
			return clientRepo;
		} as unknown as typeof ClientRepositoryD1);
		vi.mocked(EnvironmentRepositoryD1).mockImplementation(function () {
			return envRepo;
		} as unknown as typeof EnvironmentRepositoryD1);

		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-07T12:00:00.000Z"));
		vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("log-row-id");
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	describe("logActivity", () => {
		it("inserts a row with the provided environmentName", async () => {
			const service = new TokenActivityLogService(makeCtx());
			await service.logActivity({
				ip: "1.2.3.4",
				requestType: "token",
				succeeded: true,
				environmentName: "production",
			});
			expect(logRepo.insert).toHaveBeenCalledWith(
				expect.objectContaining({
					id: "log-row-id",
					ip_address: "1.2.3.4",
					request_type: "token",
					succeeded: 1,
					environment_name: "production",
					created_at: "2026-04-07T12:00:00.000Z",
				})
			);
		});

		it("records succeeded as 0 for failed requests", async () => {
			const service = new TokenActivityLogService(makeCtx());
			await service.logActivity({ ip: null, requestType: "authorize", succeeded: false });
			expect(logRepo.insert).toHaveBeenCalledWith(
				expect.objectContaining({ succeeded: 0, ip_address: null })
			);
		});

		it("looks up the environment name via clientId when environmentName is not provided", async () => {
			vi.mocked(clientRepo.getByClientIdentifier).mockResolvedValue({
				id: "client-row-1",
				clientId: "app-client-id",
				clientSecret: "s",
				environmentId: "env-1",
				createdBy: "u1",
				expiresAt: null,
				name: null,
			});
			vi.mocked(envRepo.getById).mockResolvedValue({ id: "env-1", name: "staging" });

			const service = new TokenActivityLogService(makeCtx());
			await service.logActivity({
				ip: null,
				requestType: "validate",
				succeeded: true,
				clientId: "app-client-id",
			});

			expect(logRepo.insert).toHaveBeenCalledWith(
				expect.objectContaining({ environment_name: "staging" })
			);
		});

		it("falls back to getById when getByClientIdentifier returns null", async () => {
			vi.mocked(clientRepo.getByClientIdentifier).mockResolvedValue(null);
			vi.mocked(clientRepo.getById).mockResolvedValue({
				id: "client-row-1",
				clientId: "app-client-id",
				clientSecret: "s",
				environmentId: "env-2",
				createdBy: "u1",
				expiresAt: null,
				name: null,
			});
			vi.mocked(envRepo.getById).mockResolvedValue({ id: "env-2", name: "dev" });

			const service = new TokenActivityLogService(makeCtx());
			await service.logActivity({
				ip: null,
				requestType: "token",
				succeeded: true,
				clientId: "app-client-id",
			});

			expect(logRepo.insert).toHaveBeenCalledWith(
				expect.objectContaining({ environment_name: "dev" })
			);
		});

		it("logs null for environmentName when the client is not found", async () => {
			vi.mocked(clientRepo.getByClientIdentifier).mockResolvedValue(null);
			vi.mocked(clientRepo.getById).mockResolvedValue(null);

			const service = new TokenActivityLogService(makeCtx());
			await service.logActivity({
				ip: null,
				requestType: "token",
				succeeded: false,
				clientId: "unknown-client",
			});

			expect(logRepo.insert).toHaveBeenCalledWith(
				expect.objectContaining({ environment_name: null })
			);
		});

		it("skips client lookup when clientId is blank", async () => {
			const service = new TokenActivityLogService(makeCtx());
			await service.logActivity({
				ip: null,
				requestType: "cleanup",
				succeeded: true,
				clientId: "   ",
			});
			expect(clientRepo.getByClientIdentifier).not.toHaveBeenCalled();
			expect(logRepo.insert).toHaveBeenCalledWith(
				expect.objectContaining({ environment_name: null })
			);
		});

		it("stores the durationMs when provided", async () => {
			const service = new TokenActivityLogService(makeCtx());
			await service.logActivity({
				ip: null,
				requestType: "token",
				succeeded: true,
				durationMs: 42,
			});
			expect(logRepo.insert).toHaveBeenCalledWith(
				expect.objectContaining({ duration_ms: 42 })
			);
		});
	});

	describe("getMetricsSince", () => {
		it("delegates to the log repo", async () => {
			const metrics: TokenActivityMetrics = {
				from: "2026-04-01T00:00:00.000Z",
				to: "2026-04-07T12:00:00.000Z",
				overallAvgDurationMs: null,
				avgDurationMsByType: { authorize: null, token: null, validate: null },
				byEnvironment: {},
				byDay: [],
			};
			vi.mocked(logRepo.getMetricsSince).mockResolvedValue(metrics);

			const service = new TokenActivityLogService(makeCtx());
			const result = await service.getMetricsSince("2026-04-01T00:00:00.000Z");
			expect(result).toBe(metrics);
			expect(logRepo.getMetricsSince).toHaveBeenCalledWith("2026-04-01T00:00:00.000Z");
		});
	});

	describe("listLogs", () => {
		it("delegates to the log repo", async () => {
			const listResult: ListLogsResult = { rows: [], total: 0 };
			vi.mocked(logRepo.listLogs).mockResolvedValue(listResult);

			const service = new TokenActivityLogService(makeCtx());
			const result = await service.listLogs({ limit: 10, offset: 0 });
			expect(result).toBe(listResult);
			expect(logRepo.listLogs).toHaveBeenCalledWith({ limit: 10, offset: 0 });
		});
	});
});
