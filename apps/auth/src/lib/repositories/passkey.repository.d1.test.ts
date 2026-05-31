import { describe, expect, it } from "vitest";
import { PasskeyRepositoryD1 } from "./passkey.repository.d1";
import type { PasskeyCredentialRow } from "./passkey.repository";

/**
 * Minimal fake of the D1 prepared-statement API. It records every executed statement
 * (normalized SQL + bound params) and returns canned results for `.first()`, `.all()`,
 * and `.run()`. This lets us assert the *exact* SQL the repository issues — in particular
 * the IDOR-scoping `WHERE id = ? AND user_id = ?` clauses and the `meta.changes` handling —
 * without standing up a real SQLite database.
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
		calls,
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

function dbRow(overrides?: Record<string, unknown>) {
	return {
		id: "row-1",
		userId: "user-1",
		credentialId: "cred-b64",
		publicKey: "pub-b64",
		counter: 3,
		deviceType: "singleDevice",
		backedUp: 1,
		transports: JSON.stringify(["internal"]),
		name: "Chrome on macOS",
		lastUsedAt: "2026-05-01T10:00:00.000Z",
		createdAt: "2026-04-01T10:00:00.000Z",
		...overrides,
	};
}

describe("PasskeyRepositoryD1", () => {
	it("insertCredential persists name and last_used_at in column order", async () => {
		const { db, calls } = makeFakeD1();
		const repo = new PasskeyRepositoryD1(db);
		const row: PasskeyCredentialRow = {
			id: "row-1",
			userId: "user-1",
			credentialId: "cred-b64",
			publicKey: "pub-b64",
			counter: 0,
			deviceType: "singleDevice",
			backedUp: true,
			transports: JSON.stringify(["internal"]),
			name: "Chrome on macOS",
			lastUsedAt: null,
			createdAt: "2026-04-01T10:00:00.000Z",
		};

		await repo.insertCredential(row);

		expect(calls).toHaveLength(1);
		expect(calls[0].sql).toContain("name, last_used_at, created_at");
		// backedUp serialized to 1, name + last_used_at present in the right slots.
		expect(calls[0].binds).toEqual([
			"row-1",
			"user-1",
			"cred-b64",
			"pub-b64",
			0,
			"singleDevice",
			1,
			JSON.stringify(["internal"]),
			"Chrome on macOS",
			null,
			"2026-04-01T10:00:00.000Z",
		]);
	});

	it("findCredentialByRowIdForUser scopes by id AND user_id and maps backedUp to boolean", async () => {
		const { db, calls } = makeFakeD1({ first: dbRow() });
		const repo = new PasskeyRepositoryD1(db);

		const result = await repo.findCredentialByRowIdForUser("row-1", "user-1");

		expect(calls[0].sql).toContain("WHERE id = ? AND user_id = ?");
		expect(calls[0].binds).toEqual(["row-1", "user-1"]);
		expect(result?.backedUp).toBe(true);
		expect(result?.name).toBe("Chrome on macOS");
		expect(result?.lastUsedAt).toBe("2026-05-01T10:00:00.000Z");
	});

	it("findCredentialByRowIdForUser returns null when not found", async () => {
		const { db } = makeFakeD1({ first: null });
		const repo = new PasskeyRepositoryD1(db);
		expect(await repo.findCredentialByRowIdForUser("row-x", "user-1")).toBeNull();
	});

	it("updateCredentialCounter sets both counter and last_used_at", async () => {
		const { db, calls } = makeFakeD1();
		const repo = new PasskeyRepositoryD1(db);

		await repo.updateCredentialCounter("cred-b64", 9, "2026-05-30T12:00:00.000Z");

		expect(calls[0].sql).toContain("SET counter = ?, last_used_at = ? WHERE credential_id = ?");
		expect(calls[0].binds).toEqual([9, "2026-05-30T12:00:00.000Z", "cred-b64"]);
	});

	it("deleteCredentialForUser scopes by id AND user_id and returns true only when a row changed", async () => {
		const deleted = makeFakeD1({ run: { meta: { changes: 1 } } });
		const repoDeleted = new PasskeyRepositoryD1(deleted.db);
		expect(await repoDeleted.deleteCredentialForUser("user-1", "row-1")).toBe(true);
		expect(deleted.calls[0].sql).toContain("WHERE id = ? AND user_id = ?");
		expect(deleted.calls[0].binds).toEqual(["row-1", "user-1"]);

		const missing = makeFakeD1({ run: { meta: { changes: 0 } } });
		const repoMissing = new PasskeyRepositoryD1(missing.db);
		expect(await repoMissing.deleteCredentialForUser("user-1", "row-x")).toBe(false);
	});

	it("renameCredential scopes by id AND user_id and binds name first", async () => {
		const { db, calls } = makeFakeD1({ run: { meta: { changes: 1 } } });
		const repo = new PasskeyRepositoryD1(db);

		const ok = await repo.renameCredential("user-1", "row-1", "My laptop");

		expect(ok).toBe(true);
		expect(calls[0].sql).toContain("SET name = ? WHERE id = ? AND user_id = ?");
		expect(calls[0].binds).toEqual(["My laptop", "row-1", "user-1"]);
	});

	it("renameCredential returns false when no row matched", async () => {
		const { db } = makeFakeD1({ run: { meta: { changes: 0 } } });
		const repo = new PasskeyRepositoryD1(db);
		expect(await repo.renameCredential("user-1", "row-x", "x")).toBe(false);
	});
});
