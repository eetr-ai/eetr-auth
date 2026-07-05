import { describe, expect, it } from "vitest";
import { DcrRateLimitRepositoryD1 } from "./dcr-rate-limit.repository.d1";

/**
 * Minimal fake of the D1 prepared-statement API: records normalized SQL + binds and returns
 * canned results, so we can assert the UPSERT/SELECT the repository issues without a real
 * SQLite database. Mirrors authorization-code.repository.d1.test.ts.
 */
function makeFakeD1(canned: { first?: unknown; run?: { meta: { changes?: number } } } = {}) {
	const calls: { sql: string; binds: unknown[] }[] = [];
	const norm = (sql: string) => sql.replace(/\s+/g, " ").trim();
	const db = {
		prepare(sql: string) {
			const stmt = {
				_binds: [] as unknown[],
				bind(...b: unknown[]) {
					stmt._binds = b;
					return stmt;
				},
				async first() {
					calls.push({ sql: norm(sql), binds: stmt._binds });
					return canned.first ?? null;
				},
				async run() {
					calls.push({ sql: norm(sql), binds: stmt._binds });
					return canned.run ?? { meta: { changes: 0 } };
				},
			};
			return stmt;
		},
	};
	return { db: db as unknown as D1Database, calls };
}

describe("DcrRateLimitRepositoryD1", () => {
	it("incrementAndGet UPSERTs the (ip, day) counter and returns the running count", async () => {
		const { db, calls } = makeFakeD1({ first: { count: 3 } });
		const repo = new DcrRateLimitRepositoryD1(db);

		const count = await repo.incrementAndGet("203.0.113.5", "2026-07-04");

		const upsert = calls.find((c) => c.sql.startsWith("INSERT INTO dcr_rate_limit"));
		expect(upsert?.sql).toContain("ON CONFLICT(ip, day) DO UPDATE SET count = count + 1");
		expect(upsert?.binds).toEqual(["203.0.113.5", "2026-07-04"]);
		const select = calls.find((c) => c.sql.startsWith("SELECT count"));
		expect(select?.binds).toEqual(["203.0.113.5", "2026-07-04"]);
		expect(count).toBe(3);
	});

	it("deleteOlderThan prunes rows for earlier days and returns the change count", async () => {
		const { db, calls } = makeFakeD1({ run: { meta: { changes: 7 } } });
		const repo = new DcrRateLimitRepositoryD1(db);

		const deleted = await repo.deleteOlderThan("2026-07-04");

		const del = calls.find((c) => c.sql.startsWith("DELETE FROM dcr_rate_limit"));
		expect(del?.sql).toContain("WHERE day < ?");
		expect(del?.binds).toEqual(["2026-07-04"]);
		expect(deleted).toBe(7);
	});
});
