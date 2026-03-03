import type {
	AuthorizationCode,
	AuthorizationCodeRepository,
	AuthorizationCodeRow,
	AuthorizationCodeWithScopeIds,
} from "./authorization-code.repository";

function rowToAuthorizationCode(row: {
	id: string;
	code_id: string;
	client_id: string;
	redirect_uri: string;
	code_challenge: string;
	code_challenge_method: string;
	subject: string;
	expires_at: string;
	used_at: string | null;
	created_at: string;
}): AuthorizationCode {
	return {
		id: row.id,
		codeId: row.code_id,
		clientId: row.client_id,
		redirectUri: row.redirect_uri,
		codeChallenge: row.code_challenge,
		codeChallengeMethod: row.code_challenge_method,
		subject: row.subject,
		expiresAt: row.expires_at,
		usedAt: row.used_at,
		createdAt: row.created_at,
	};
}

export class AuthorizationCodeRepositoryD1 implements AuthorizationCodeRepository {
	constructor(private readonly db: D1Database) {}

	async create(row: AuthorizationCodeRow, clientScopeIds: string[]): Promise<void> {
		await this.db
			.prepare(
				[
					"INSERT INTO authorization_codes (",
					"id, code_id, client_id, redirect_uri, code_challenge, code_challenge_method, subject, expires_at, used_at, created_at",
					") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
				].join(" ")
			)
			.bind(
				row.id,
				row.code_id,
				row.client_id,
				row.redirect_uri,
				row.code_challenge,
				row.code_challenge_method,
				row.subject,
				row.expires_at,
				row.used_at,
				row.created_at
			)
			.run();

		for (const clientScopeId of clientScopeIds) {
			await this.db
				.prepare(
					"INSERT INTO authorization_code_scopes (id, authorization_code_id, client_scope_id) VALUES (?, ?, ?)"
				)
				.bind(crypto.randomUUID(), row.id, clientScopeId)
				.run();
		}
	}

	async getByCodeId(codeId: string): Promise<AuthorizationCodeWithScopeIds | null> {
		const row = await this.db
			.prepare(
				[
					"SELECT id, code_id, client_id, redirect_uri, code_challenge, code_challenge_method, subject, expires_at, used_at, created_at",
					"FROM authorization_codes",
					"WHERE code_id = ?",
				].join(" ")
			)
			.bind(codeId)
			.first<{
				id: string;
				code_id: string;
				client_id: string;
				redirect_uri: string;
				code_challenge: string;
				code_challenge_method: string;
				subject: string;
				expires_at: string;
				used_at: string | null;
				created_at: string;
			}>();
		if (!row) return null;

		const scopeRows = await this.db
			.prepare(
				[
					"SELECT client_scope_id",
					"FROM authorization_code_scopes",
					"WHERE authorization_code_id = ?",
					"ORDER BY client_scope_id",
				].join(" ")
			)
			.bind(row.id)
			.all<{ client_scope_id: string }>();

		return {
			...rowToAuthorizationCode(row),
			clientScopeIds: (scopeRows.results ?? []).map((scopeRow) => scopeRow.client_scope_id),
		};
	}

	async markUsed(id: string, usedAt: string): Promise<void> {
		await this.db
			.prepare("UPDATE authorization_codes SET used_at = ? WHERE id = ?")
			.bind(usedAt, id)
			.run();
	}

	async deleteUsedOrExpired(nowIso: string): Promise<number> {
		const result = await this.db
			.prepare(
				[
					"DELETE FROM authorization_codes",
					"WHERE used_at IS NOT NULL OR expires_at <= ?",
				].join(" ")
			)
			.bind(nowIso)
			.run();
		return Number(result.meta.changes ?? 0);
	}
}
