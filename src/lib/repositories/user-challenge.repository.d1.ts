import type {
	UserChallengeKind,
	UserChallengeRepository,
	UserChallengeRow,
} from "./user-challenge.repository";

export class UserChallengeRepositoryD1 implements UserChallengeRepository {
	constructor(private readonly db: D1Database) {}

	async insert(
		row: Omit<UserChallengeRow, "consumedAt"> & { consumedAt?: null }
	): Promise<void> {
		await this.db
			.prepare(
				`INSERT INTO user_challenges (id, user_id, kind, code_hash, expires_at, created_at, consumed_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`
			)
			.bind(
				row.id,
				row.userId,
				row.kind,
				row.codeHash,
				row.expiresAt,
				row.createdAt
			)
			.run();
	}

	async getById(id: string): Promise<UserChallengeRow | null> {
		const r = await this.db
			.prepare(
				`SELECT id, user_id as userId, kind, code_hash as codeHash, expires_at as expiresAt,
            created_at as createdAt, consumed_at as consumedAt
         FROM user_challenges WHERE id = ?`
			)
			.bind(id)
			.first<{
				id: string;
				userId: string;
				kind: string;
				codeHash: string | null;
				expiresAt: string;
				createdAt: string;
				consumedAt: string | null;
			}>();
		if (!r) return null;
		return {
			id: r.id,
			userId: r.userId,
			kind: r.kind as UserChallengeKind,
			codeHash: r.codeHash,
			expiresAt: r.expiresAt,
			createdAt: r.createdAt,
			consumedAt: r.consumedAt,
		};
	}

	async deleteById(id: string): Promise<void> {
		await this.db.prepare("DELETE FROM user_challenges WHERE id = ?").bind(id).run();
	}

	async markConsumed(id: string, consumedAtIso: string): Promise<void> {
		await this.db
			.prepare("UPDATE user_challenges SET consumed_at = ? WHERE id = ?")
			.bind(consumedAtIso, id)
			.run();
	}

	async deleteExpiredBefore(iso: string): Promise<number> {
		const result = await this.db
			.prepare("DELETE FROM user_challenges WHERE expires_at < ?")
			.bind(iso)
			.run();
		return result.meta.changes ?? 0;
	}
}
