import type { DcrRateLimitRepository } from "./dcr-rate-limit.repository";

export class DcrRateLimitRepositoryD1 implements DcrRateLimitRepository {
	constructor(private readonly db: D1Database) {}

	async incrementAndGet(ip: string, day: string): Promise<number> {
		// Atomic UPSERT: first attempt inserts count=1, subsequent ones increment. Then read
		// back the running total. The (ip, day) primary key makes the increment race-safe.
		await this.db
			.prepare(
				[
					"INSERT INTO dcr_rate_limit (ip, day, count) VALUES (?, ?, 1)",
					"ON CONFLICT(ip, day) DO UPDATE SET count = count + 1",
				].join(" ")
			)
			.bind(ip, day)
			.run();
		const row = await this.db
			.prepare("SELECT count FROM dcr_rate_limit WHERE ip = ? AND day = ?")
			.bind(ip, day)
			.first<{ count: number }>();
		return row?.count ?? 0;
	}

	async deleteOlderThan(day: string): Promise<number> {
		const result = await this.db
			.prepare("DELETE FROM dcr_rate_limit WHERE day < ?")
			.bind(day)
			.run();
		return Number(result.meta.changes ?? 0);
	}
}
