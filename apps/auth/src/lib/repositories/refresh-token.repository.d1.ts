import type {
	RefreshTokenActivity,
	RefreshTokenRecord,
	RefreshTokenRepository,
	RefreshTokenRow,
} from "./refresh-token.repository";

function statusFromDates(expiresAt: string, revokedAt: string | null, nowIso: string) {
	if (revokedAt) return "revoked" as const;
	if (expiresAt <= nowIso) return "expired" as const;
	return "active" as const;
}

export class RefreshTokenRepositoryD1 implements RefreshTokenRepository {
	constructor(private readonly db: D1Database) {}

	async createRefreshToken(row: RefreshTokenRow, clientScopeIds: string[]): Promise<void> {
		await this.db
			.prepare(
				[
					"INSERT INTO refresh_tokens (",
					"id, refresh_token_id, client_id, subject, access_token_id, expires_at, revoked_at, rotated_from_id, created_at",
					") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
				].join(" ")
			)
			.bind(
				row.id,
				row.refresh_token_id,
				row.client_id,
				row.subject,
				row.access_token_id,
				row.expires_at,
				row.revoked_at,
				row.rotated_from_id,
				row.created_at
			)
			.run();

		for (const clientScopeId of clientScopeIds) {
			await this.db
				.prepare(
					"INSERT INTO refresh_token_scopes (id, refresh_token_id, client_scope_id) VALUES (?, ?, ?)"
				)
				.bind(crypto.randomUUID(), row.id, clientScopeId)
				.run();
		}
	}

	async getByTokenId(refreshTokenId: string): Promise<RefreshTokenRecord | null> {
		const row = await this.db
			.prepare(
				[
					"SELECT id, refresh_token_id, client_id, subject, access_token_id, expires_at, revoked_at, rotated_from_id, created_at",
					"FROM refresh_tokens",
					"WHERE refresh_token_id = ?",
				].join(" ")
			)
			.bind(refreshTokenId)
			.first<{
				id: string;
				refresh_token_id: string;
				client_id: string;
				subject: string | null;
				access_token_id: string | null;
				expires_at: string;
				revoked_at: string | null;
				rotated_from_id: string | null;
				created_at: string;
			}>();
		if (!row) return null;

		const scopeRows = await this.db
			.prepare(
				[
					"SELECT client_scope_id",
					"FROM refresh_token_scopes",
					"WHERE refresh_token_id = ?",
					"ORDER BY client_scope_id",
				].join(" ")
			)
			.bind(row.id)
			.all<{ client_scope_id: string }>();

		return {
			id: row.id,
			refreshTokenId: row.refresh_token_id,
			clientId: row.client_id,
			subject: row.subject,
			accessTokenId: row.access_token_id,
			expiresAt: row.expires_at,
			revokedAt: row.revoked_at,
			rotatedFromId: row.rotated_from_id,
			createdAt: row.created_at,
			clientScopeIds: (scopeRows.results ?? []).map((scopeRow) => scopeRow.client_scope_id),
		};
	}

	async revoke(id: string, revokedAt: string): Promise<void> {
		await this.db
			.prepare("UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?")
			.bind(revokedAt, id)
			.run();
	}

	async listRefreshTokenActivity(clientId?: string): Promise<RefreshTokenActivity[]> {
		const nowIso = new Date().toISOString();
		const query = clientId
			? [
					"SELECT",
					"rt.id AS id,",
					"rt.refresh_token_id AS tokenId,",
					"c.client_id AS clientId,",
					"c.name AS clientName,",
					"c.environment_id AS environmentId,",
					"rt.expires_at AS expiresAt,",
					"rt.created_at AS createdAt,",
					"rt.revoked_at AS revokedAt,",
					"parent.refresh_token_id AS rotatedFromTokenId,",
					"GROUP_CONCAT(DISTINCT s.scope_name) AS scopeNamesCsv",
					"FROM refresh_tokens rt",
					"INNER JOIN clients c ON c.id = rt.client_id",
					"LEFT JOIN refresh_tokens parent ON parent.id = rt.rotated_from_id",
					"LEFT JOIN refresh_token_scopes rts ON rts.refresh_token_id = rt.id",
					"LEFT JOIN client_scopes cs ON cs.id = rts.client_scope_id",
					"LEFT JOIN scopes s ON s.id = cs.scope_id",
					"WHERE c.id = ?",
					"GROUP BY rt.id, rt.refresh_token_id, c.client_id, c.name, c.environment_id, rt.expires_at, rt.created_at, rt.revoked_at, parent.refresh_token_id",
					"ORDER BY rt.created_at DESC",
				].join(" ")
			: [
					"SELECT",
					"rt.id AS id,",
					"rt.refresh_token_id AS tokenId,",
					"c.client_id AS clientId,",
					"c.name AS clientName,",
					"c.environment_id AS environmentId,",
					"rt.expires_at AS expiresAt,",
					"rt.created_at AS createdAt,",
					"rt.revoked_at AS revokedAt,",
					"parent.refresh_token_id AS rotatedFromTokenId,",
					"GROUP_CONCAT(DISTINCT s.scope_name) AS scopeNamesCsv",
					"FROM refresh_tokens rt",
					"INNER JOIN clients c ON c.id = rt.client_id",
					"LEFT JOIN refresh_tokens parent ON parent.id = rt.rotated_from_id",
					"LEFT JOIN refresh_token_scopes rts ON rts.refresh_token_id = rt.id",
					"LEFT JOIN client_scopes cs ON cs.id = rts.client_scope_id",
					"LEFT JOIN scopes s ON s.id = cs.scope_id",
					"GROUP BY rt.id, rt.refresh_token_id, c.client_id, c.name, c.environment_id, rt.expires_at, rt.created_at, rt.revoked_at, parent.refresh_token_id",
					"ORDER BY rt.created_at DESC",
				].join(" ");

		const stmt = clientId ? this.db.prepare(query).bind(clientId) : this.db.prepare(query);
		const result = await stmt.all<{
			id: string;
			tokenId: string;
			clientId: string;
			clientName: string | null;
			environmentId: string;
			expiresAt: string;
			createdAt: string;
			revokedAt: string | null;
			rotatedFromTokenId: string | null;
			scopeNamesCsv: string | null;
		}>();

		return (result.results ?? []).map((row) => ({
			tokenType: "refresh",
			id: row.id,
			tokenId: row.tokenId,
			clientId: row.clientId,
			clientName: row.clientName ?? null,
			environmentId: row.environmentId,
			expiresAt: row.expiresAt,
			createdAt: row.createdAt,
			revokedAt: row.revokedAt,
			rotatedFromTokenId: row.rotatedFromTokenId,
			status: statusFromDates(row.expiresAt, row.revokedAt, nowIso),
			scopeNames: row.scopeNamesCsv ? row.scopeNamesCsv.split(",").filter(Boolean) : [],
		}));
	}

	async deleteByTokenId(refreshTokenId: string): Promise<boolean> {
		const result = await this.db
			.prepare("DELETE FROM refresh_tokens WHERE refresh_token_id = ?")
			.bind(refreshTokenId)
			.run();
		return Number(result.meta.changes ?? 0) > 0;
	}

	async deleteExpired(nowIso: string): Promise<number> {
		const result = await this.db
			.prepare("DELETE FROM refresh_tokens WHERE expires_at <= ?")
			.bind(nowIso)
			.run();
		return Number(result.meta.changes ?? 0);
	}

	async deleteRevoked(): Promise<number> {
		const result = await this.db
			.prepare("DELETE FROM refresh_tokens WHERE revoked_at IS NOT NULL")
			.run();
		return Number(result.meta.changes ?? 0);
	}
}
