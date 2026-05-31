import { describe, expect, it } from "vitest";
import { AuthorizationCodeRepositoryD1 } from "./authorization-code.repository.d1";
import type { AuthorizationCodeRow } from "./authorization-code.repository";

/**
 * Minimal fake of the D1 prepared-statement API. Records normalized SQL + bound params
 * and returns canned results, so we can assert the exact columns/binds the repository
 * issues — in particular that the OIDC `nonce`/`auth_time` columns are persisted and
 * read back — without a real SQLite database. Mirrors passkey.repository.d1.test.ts.
 */
type CannedResults = {
	first?: unknown;
	all?: { results: unknown[] };
	run?: { meta: { changes?: number } };
};

function makeFakeD1(canned: CannedResults = {}) {
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
				async all() {
					calls.push({ sql: norm(sql), binds: stmt._binds });
					return canned.all ?? { results: [] };
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

function makeRow(overrides?: Partial<AuthorizationCodeRow>): AuthorizationCodeRow {
	return {
		id: "row-1",
		code_id: "code_abc",
		client_id: "client-1",
		redirect_uri: "https://client.example.com/cb",
		code_challenge: "challenge",
		code_challenge_method: "S256",
		subject: "user-1",
		nonce: "n-0S6_WzA2Mj",
		auth_time: "2026-04-06T13:10:00.000Z",
		expires_at: "2026-04-06T13:15:00.000Z",
		used_at: null,
		created_at: "2026-04-06T13:10:00.000Z",
		...overrides,
	};
}

describe("AuthorizationCodeRepositoryD1", () => {
	it("create() persists nonce and auth_time in column order", async () => {
		const { db, calls } = makeFakeD1();
		const repo = new AuthorizationCodeRepositoryD1(db);

		await repo.create(makeRow(), []);

		const insert = calls.find((c) => c.sql.includes("INSERT INTO authorization_codes"));
		expect(insert).toBeDefined();
		expect(insert?.sql).toContain("subject, nonce, auth_time, expires_at");
		expect(insert?.binds).toEqual([
			"row-1",
			"code_abc",
			"client-1",
			"https://client.example.com/cb",
			"challenge",
			"S256",
			"user-1",
			"n-0S6_WzA2Mj",
			"2026-04-06T13:10:00.000Z",
			"2026-04-06T13:15:00.000Z",
			null,
			"2026-04-06T13:10:00.000Z",
		]);
	});

	it("create() binds a null nonce when absent", async () => {
		const { db, calls } = makeFakeD1();
		const repo = new AuthorizationCodeRepositoryD1(db);

		await repo.create(makeRow({ nonce: null, auth_time: null }), []);

		const insert = calls.find((c) => c.sql.includes("INSERT INTO authorization_codes"));
		// nonce slot (index 7) and auth_time slot (index 8) are null.
		expect(insert?.binds[7]).toBeNull();
		expect(insert?.binds[8]).toBeNull();
	});

	it("getByCodeId() selects and maps nonce and auth_time back", async () => {
		const { db, calls } = makeFakeD1({
			first: {
				id: "row-1",
				code_id: "code_abc",
				client_id: "client-1",
				redirect_uri: "https://client.example.com/cb",
				code_challenge: "challenge",
				code_challenge_method: "S256",
				subject: "user-1",
				nonce: "n-0S6_WzA2Mj",
				auth_time: "2026-04-06T13:10:00.000Z",
				expires_at: "2026-04-06T13:15:00.000Z",
				used_at: null,
				created_at: "2026-04-06T13:10:00.000Z",
			},
			all: { results: [{ client_scope_id: "client-scope-1" }] },
		});
		const repo = new AuthorizationCodeRepositoryD1(db);

		const result = await repo.getByCodeId("code_abc");

		const select = calls.find((c) => c.sql.startsWith("SELECT"));
		expect(select?.sql).toContain("subject, nonce, auth_time, expires_at");
		expect(result?.nonce).toBe("n-0S6_WzA2Mj");
		expect(result?.authTime).toBe("2026-04-06T13:10:00.000Z");
		expect(result?.clientScopeIds).toEqual(["client-scope-1"]);
	});
});
