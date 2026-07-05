import { describe, expect, it, vi } from "vitest";

import type { DcrRateLimitRepository } from "@/lib/repositories/dcr-rate-limit.repository";
import { DcrRateLimitService } from "./dcr-rate-limit.service";

function createRepoMock(count: number): DcrRateLimitRepository {
	return {
		incrementAndGet: vi.fn().mockResolvedValue(count),
		deleteOlderThan: vi.fn(),
	};
}

describe("DcrRateLimitService.recordAttempt", () => {
	it("allows an attempt within the daily budget", async () => {
		const repo = createRepoMock(10);
		const service = new DcrRateLimitService({ repo, limitPerDay: 10 });

		const result = await service.recordAttempt("203.0.113.5");

		expect(repo.incrementAndGet).toHaveBeenCalledWith("203.0.113.5", expect.any(String));
		expect(result).toEqual({ allowed: true, limit: 10, attempts: 10 });
	});

	it("disallows an attempt over the daily budget", async () => {
		const repo = createRepoMock(11);
		const service = new DcrRateLimitService({ repo, limitPerDay: 10 });

		const result = await service.recordAttempt("203.0.113.5");

		expect(result).toEqual({ allowed: false, limit: 10, attempts: 11 });
	});

	it("buckets IP-less requests under \"unknown\"", async () => {
		const repo = createRepoMock(1);
		const service = new DcrRateLimitService({ repo, limitPerDay: 10 });

		await service.recordAttempt(null);

		expect(repo.incrementAndGet).toHaveBeenCalledWith("unknown", expect.any(String));
	});
});
