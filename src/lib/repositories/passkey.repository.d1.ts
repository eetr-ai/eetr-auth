import type {
	PasskeyChallengeRow,
	PasskeyCredentialRow,
	PasskeyExchangeTokenRow,
	PasskeyRepository,
} from "./passkey.repository";

export class PasskeyRepositoryD1 implements PasskeyRepository {
	constructor(private readonly db: D1Database) {}

	// ── Challenges ────────────────────────────────────────────────────────────

	async insertChallenge(row: PasskeyChallengeRow): Promise<void> {
		await this.db
			.prepare(
				`INSERT INTO passkey_challenges (id, user_id, challenge, kind, expires_at)
         VALUES (?, ?, ?, ?, ?)`
			)
			.bind(row.id, row.userId ?? null, row.challenge, row.kind, row.expiresAt)
			.run();
	}

	async getChallengeById(id: string): Promise<PasskeyChallengeRow | null> {
		const r = await this.db
			.prepare(
				`SELECT id, user_id as userId, challenge, kind, expires_at as expiresAt
         FROM passkey_challenges WHERE id = ?`
			)
			.bind(id)
			.first<{
				id: string;
				userId: string | null;
				challenge: string;
				kind: string;
				expiresAt: string;
			}>();
		if (!r) return null;
		return {
			id: r.id,
			userId: r.userId,
			challenge: r.challenge,
			kind: r.kind as "registration" | "authentication",
			expiresAt: r.expiresAt,
		};
	}

	async deleteChallenge(id: string): Promise<void> {
		await this.db.prepare("DELETE FROM passkey_challenges WHERE id = ?").bind(id).run();
	}

	async deleteExpiredChallenges(beforeIso: string): Promise<number> {
		const result = await this.db
			.prepare("DELETE FROM passkey_challenges WHERE expires_at < ?")
			.bind(beforeIso)
			.run();
		return result.meta.changes ?? 0;
	}

	// ── Credentials ───────────────────────────────────────────────────────────

	async insertCredential(row: PasskeyCredentialRow): Promise<void> {
		await this.db
			.prepare(
				`INSERT INTO user_passkeys
           (id, user_id, credential_id, public_key, counter, device_type, backed_up, transports, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				row.id,
				row.userId,
				row.credentialId,
				row.publicKey,
				row.counter,
				row.deviceType,
				row.backedUp ? 1 : 0,
				row.transports ?? null,
				row.createdAt
			)
			.run();
	}

	async findCredentialById(credentialId: string): Promise<PasskeyCredentialRow | null> {
		const r = await this.db
			.prepare(
				`SELECT id, user_id as userId, credential_id as credentialId, public_key as publicKey,
                counter, device_type as deviceType, backed_up as backedUp,
                transports, created_at as createdAt
         FROM user_passkeys WHERE credential_id = ?`
			)
			.bind(credentialId)
			.first<{
				id: string;
				userId: string;
				credentialId: string;
				publicKey: string;
				counter: number;
				deviceType: string;
				backedUp: number;
				transports: string | null;
				createdAt: string;
			}>();
		if (!r) return null;
		return { ...r, backedUp: r.backedUp === 1 };
	}

	async findCredentialsByUserId(userId: string): Promise<PasskeyCredentialRow[]> {
		const { results } = await this.db
			.prepare(
				`SELECT id, user_id as userId, credential_id as credentialId, public_key as publicKey,
                counter, device_type as deviceType, backed_up as backedUp,
                transports, created_at as createdAt
         FROM user_passkeys WHERE user_id = ? ORDER BY created_at ASC`
			)
			.bind(userId)
			.all<{
				id: string;
				userId: string;
				credentialId: string;
				publicKey: string;
				counter: number;
				deviceType: string;
				backedUp: number;
				transports: string | null;
				createdAt: string;
			}>();
		return results.map((r) => ({ ...r, backedUp: r.backedUp === 1 }));
	}

	async updateCredentialCounter(credentialId: string, counter: number): Promise<void> {
		await this.db
			.prepare("UPDATE user_passkeys SET counter = ? WHERE credential_id = ?")
			.bind(counter, credentialId)
			.run();
	}

	async deleteCredential(credentialId: string): Promise<void> {
		await this.db
			.prepare("DELETE FROM user_passkeys WHERE credential_id = ?")
			.bind(credentialId)
			.run();
	}

	async hasCredentialForUser(userId: string): Promise<boolean> {
		const r = await this.db
			.prepare("SELECT 1 FROM user_passkeys WHERE user_id = ? LIMIT 1")
			.bind(userId)
			.first<{ 1: number }>();
		return r !== null;
	}

	// ── Exchange tokens ───────────────────────────────────────────────────────

	async insertExchangeToken(row: PasskeyExchangeTokenRow): Promise<void> {
		await this.db
			.prepare(
				`INSERT INTO passkey_exchange_tokens (id, user_id, expires_at, used_at)
         VALUES (?, ?, ?, NULL)`
			)
			.bind(row.id, row.userId, row.expiresAt)
			.run();
	}

	/**
	 * Atomically marks the token as used and returns it.
	 * Returns null if the token does not exist, is already used, or is expired.
	 */
	async consumeExchangeToken(id: string): Promise<PasskeyExchangeTokenRow | null> {
		const now = new Date().toISOString();
		const r = await this.db
			.prepare(
				`UPDATE passkey_exchange_tokens
         SET used_at = ?
         WHERE id = ? AND used_at IS NULL AND expires_at > ?
         RETURNING id, user_id as userId, expires_at as expiresAt, used_at as usedAt`
			)
			.bind(now, id, now)
			.first<{
				id: string;
				userId: string;
				expiresAt: string;
				usedAt: string | null;
			}>();
		if (!r) return null;
		return r;
	}
}
