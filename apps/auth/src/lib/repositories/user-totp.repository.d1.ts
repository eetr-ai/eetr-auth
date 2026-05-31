import type { UserTotpRepository, UserTotpRow } from "./user-totp.repository";

export class UserTotpRepositoryD1 implements UserTotpRepository {
	constructor(private readonly db: D1Database) {}

	async get(userId: string): Promise<UserTotpRow | null> {
		const r = await this.db
			.prepare(
				`SELECT user_id as userId, secret_enc as secretEnc, confirmed_at as confirmedAt,
                created_at as createdAt, last_used_at as lastUsedAt
         FROM user_totp WHERE user_id = ?`
			)
			.bind(userId)
			.first<{
				userId: string;
				secretEnc: string;
				confirmedAt: string | null;
				createdAt: string;
				lastUsedAt: string | null;
			}>();
		return r ?? null;
	}

	async upsertPending({
		userId,
		secretEnc,
		createdAt,
	}: {
		userId: string;
		secretEnc: string;
		createdAt: string;
	}): Promise<void> {
		await this.db
			.prepare(
				`INSERT INTO user_totp (user_id, secret_enc, confirmed_at, created_at, last_used_at)
         VALUES (?, ?, NULL, ?, NULL)
         ON CONFLICT(user_id) DO UPDATE SET
           secret_enc = excluded.secret_enc,
           confirmed_at = NULL,
           created_at = excluded.created_at,
           last_used_at = NULL`
			)
			.bind(userId, secretEnc, createdAt)
			.run();
	}

	async confirm(userId: string, confirmedAtIso: string): Promise<void> {
		await this.db
			.prepare("UPDATE user_totp SET confirmed_at = ? WHERE user_id = ?")
			.bind(confirmedAtIso, userId)
			.run();
	}

	async delete(userId: string): Promise<void> {
		await this.db.prepare("DELETE FROM user_totp WHERE user_id = ?").bind(userId).run();
	}

	async touchLastUsed(userId: string, whenIso: string): Promise<void> {
		await this.db
			.prepare("UPDATE user_totp SET last_used_at = ? WHERE user_id = ?")
			.bind(whenIso, userId)
			.run();
	}
}
