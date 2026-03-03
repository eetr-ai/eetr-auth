import type {
	AccessTokenActivity,
	AccessTokenRecord,
	AccessTokenRow,
	ClientScopeGrant,
	TokenRepository,
} from "./token.repository";

export class TokenRepositoryD1 implements TokenRepository {
	constructor(private readonly db: D1Database) {}

	async createAccessToken(row: AccessTokenRow, clientScopeIds: string[]): Promise<void> {
		await this.db
			.prepare("INSERT INTO tokens (id, token_id, client_id, expires_at) VALUES (?, ?, ?, ?)")
			.bind(row.id, row.token_id, row.client_id, row.expires_at)
			.run();

		for (const clientScopeId of clientScopeIds) {
			await this.db
				.prepare("INSERT INTO token_scopes (id, token_id, client_scope_id) VALUES (?, ?, ?)")
				.bind(crypto.randomUUID(), row.id, clientScopeId)
				.run();
		}
	}

	async getClientScopeGrants(clientId: string): Promise<ClientScopeGrant[]> {
		const result = await this.db
			.prepare(
				[
					"SELECT cs.id AS clientScopeId, cs.scope_id AS scopeId, s.scope_name AS scopeName",
					"FROM client_scopes cs",
					"INNER JOIN scopes s ON s.id = cs.scope_id",
					"WHERE cs.client_id = ?",
					"ORDER BY s.scope_name",
				].join(" ")
			)
			.bind(clientId)
			.all<{ clientScopeId: string; scopeId: string; scopeName: string }>();
		return result.results ?? [];
	}

	async getClientScopeGrantsByNames(
		clientId: string,
		scopeNames: string[]
	): Promise<ClientScopeGrant[]> {
		if (scopeNames.length === 0) return [];
		const placeholders = scopeNames.map(() => "?").join(", ");
		const result = await this.db
			.prepare(
				[
					"SELECT cs.id AS clientScopeId, cs.scope_id AS scopeId, s.scope_name AS scopeName",
					"FROM client_scopes cs",
					"INNER JOIN scopes s ON s.id = cs.scope_id",
					`WHERE cs.client_id = ? AND s.scope_name IN (${placeholders})`,
					"ORDER BY s.scope_name",
				].join(" ")
			)
			.bind(clientId, ...scopeNames)
			.all<{ clientScopeId: string; scopeId: string; scopeName: string }>();
		return result.results ?? [];
	}

	async getAccessTokenByTokenId(tokenId: string): Promise<AccessTokenRecord | null> {
		const row = await this.db
			.prepare(
				[
					"SELECT",
					"t.id AS id,",
					"t.token_id AS tokenId,",
					"c.client_id AS clientId,",
					"c.environment_id AS environmentId,",
					"e.name AS environmentName,",
					"t.expires_at AS expiresAt,",
					"GROUP_CONCAT(DISTINCT s.scope_name) AS scopeNamesCsv",
					"FROM tokens t",
					"INNER JOIN clients c ON c.id = t.client_id",
					"INNER JOIN environments e ON e.id = c.environment_id",
					"LEFT JOIN token_scopes ts ON ts.token_id = t.id",
					"LEFT JOIN client_scopes cs ON cs.id = ts.client_scope_id",
					"LEFT JOIN scopes s ON s.id = cs.scope_id",
					"WHERE t.token_id = ?",
					"GROUP BY t.id, t.token_id, c.client_id, c.environment_id, e.name, t.expires_at",
				].join(" ")
			)
			.bind(tokenId)
			.first<{
				id: string;
				tokenId: string;
				clientId: string;
				environmentId: string;
				environmentName: string;
				expiresAt: string;
				scopeNamesCsv: string | null;
			}>();

		if (!row) return null;
		return {
			id: row.id,
			tokenId: row.tokenId,
			clientId: row.clientId,
			environmentId: row.environmentId,
			environmentName: row.environmentName,
			expiresAt: row.expiresAt,
			scopeNames: row.scopeNamesCsv ? row.scopeNamesCsv.split(",").filter(Boolean) : [],
		};
	}

	async listAccessTokenActivity(clientId?: string): Promise<AccessTokenActivity[]> {
		const nowIso = new Date().toISOString();
		const query = clientId
			? [
					"SELECT",
					"t.id AS id,",
					"t.token_id AS tokenId,",
					"c.client_id AS clientId,",
					"c.environment_id AS environmentId,",
					"t.expires_at AS expiresAt,",
					"GROUP_CONCAT(DISTINCT s.scope_name) AS scopeNamesCsv",
					"FROM tokens t",
					"INNER JOIN clients c ON c.id = t.client_id",
					"LEFT JOIN token_scopes ts ON ts.token_id = t.id",
					"LEFT JOIN client_scopes cs ON cs.id = ts.client_scope_id",
					"LEFT JOIN scopes s ON s.id = cs.scope_id",
					"WHERE c.id = ?",
					"GROUP BY t.id, t.token_id, c.client_id, c.environment_id, t.expires_at",
					"ORDER BY t.expires_at DESC",
				].join(" ")
			: [
					"SELECT",
					"t.id AS id,",
					"t.token_id AS tokenId,",
					"c.client_id AS clientId,",
					"c.environment_id AS environmentId,",
					"t.expires_at AS expiresAt,",
					"GROUP_CONCAT(DISTINCT s.scope_name) AS scopeNamesCsv",
					"FROM tokens t",
					"INNER JOIN clients c ON c.id = t.client_id",
					"LEFT JOIN token_scopes ts ON ts.token_id = t.id",
					"LEFT JOIN client_scopes cs ON cs.id = ts.client_scope_id",
					"LEFT JOIN scopes s ON s.id = cs.scope_id",
					"GROUP BY t.id, t.token_id, c.client_id, c.environment_id, t.expires_at",
					"ORDER BY t.expires_at DESC",
				].join(" ");

		const stmt = clientId ? this.db.prepare(query).bind(clientId) : this.db.prepare(query);
		const result = await stmt.all<{
			id: string;
			tokenId: string;
			clientId: string;
			environmentId: string;
			expiresAt: string;
			scopeNamesCsv: string | null;
		}>();

		return (result.results ?? []).map((row) => ({
			tokenType: "access",
			id: row.id,
			tokenId: row.tokenId,
			clientId: row.clientId,
			environmentId: row.environmentId,
			expiresAt: row.expiresAt,
			status: row.expiresAt <= nowIso ? "expired" : "active",
			scopeNames: row.scopeNamesCsv ? row.scopeNamesCsv.split(",").filter(Boolean) : [],
		}));
	}

	async revokeAccessTokenByTokenId(tokenId: string, expiresAt: string): Promise<boolean> {
		const result = await this.db
			.prepare(
				[
					"UPDATE tokens",
					"SET expires_at = CASE WHEN expires_at > ? THEN ? ELSE expires_at END",
					"WHERE token_id = ?",
				].join(" ")
			)
			.bind(expiresAt, expiresAt, tokenId)
			.run();
		return Number(result.meta.changes ?? 0) > 0;
	}

	async deleteAccessTokenByTokenId(tokenId: string): Promise<boolean> {
		const result = await this.db.prepare("DELETE FROM tokens WHERE token_id = ?").bind(tokenId).run();
		return Number(result.meta.changes ?? 0) > 0;
	}

	async deleteExpiredAccessTokens(nowIso: string): Promise<number> {
		const result = await this.db
			.prepare("DELETE FROM tokens WHERE expires_at <= ?")
			.bind(nowIso)
			.run();
		return Number(result.meta.changes ?? 0);
	}
}
