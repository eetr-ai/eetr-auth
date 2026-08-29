import type {
	ApiKey,
	ApiKeyRepository,
	ApiKeyRow,
	ApiKeyWithHash,
} from "./api-key.repository";
import type { ClientScopeGrant } from "./token.repository";

interface ApiKeySelectRow {
	id: string;
	key_id: string;
	client_id: string;
	user_id: string;
	user_display: string;
	name: string | null;
	created_by_display: string;
	created_at: string;
	expires_at: string | null;
	revoked_at: string | null;
	last_used_at: string | null;
}

/**
 * Shared projection. `user_display` and `created_by_display` follow the same
 * COALESCE-to-username idiom the client repository uses, so a deleted actor degrades to a
 * readable label instead of a bare id. `key_hash` is opt-in: only the authentication
 * lookup passes true, so no other query can accidentally carry the digest out of here.
 */
function selectColumns(withHash = false): string {
	return [
		"SELECT k.id, k.key_id, k.client_id, k.user_id,",
		withHash ? "k.key_hash," : "",
		"COALESCE(bu.username, k.user_id) AS user_display,",
		"k.name,",
		"COALESCE(cu.username, k.created_by, '(deleted user)') AS created_by_display,",
		"k.created_at, k.expires_at, k.revoked_at, k.last_used_at",
		"FROM api_keys k",
		"LEFT JOIN users bu ON bu.id = k.user_id",
		"LEFT JOIN users cu ON cu.id = k.created_by",
	]
		.filter(Boolean)
		.join(" ");
}

function rowToApiKey(row: ApiKeySelectRow): ApiKey {
	return {
		id: row.id,
		keyId: row.key_id,
		clientId: row.client_id,
		userId: row.user_id,
		userDisplay: row.user_display,
		name: row.name,
		createdBy: row.created_by_display,
		createdAt: row.created_at,
		expiresAt: row.expires_at,
		revokedAt: row.revoked_at,
		lastUsedAt: row.last_used_at,
	};
}

export class ApiKeyRepositoryD1 implements ApiKeyRepository {
	constructor(private readonly db: D1Database) {}

	async listByClient(clientId: string): Promise<ApiKey[]> {
		const result = await this.db
			.prepare([selectColumns(), "WHERE k.client_id = ?", "ORDER BY k.created_at DESC"].join(" "))
			.bind(clientId)
			.all<ApiKeySelectRow>();
		return (result.results ?? []).map(rowToApiKey);
	}

	async getById(id: string): Promise<ApiKey | null> {
		const row = await this.db
			.prepare([selectColumns(), "WHERE k.id = ?"].join(" "))
			.bind(id)
			.first<ApiKeySelectRow>();
		return row ? rowToApiKey(row) : null;
	}

	async getByKeyId(keyId: string): Promise<ApiKeyWithHash | null> {
		const row = await this.db
			.prepare([selectColumns(true), "WHERE k.key_id = ?"].join(" "))
			.bind(keyId)
			.first<ApiKeySelectRow & { key_hash: string }>();
		return row ? { ...rowToApiKey(row), keyHash: row.key_hash } : null;
	}

	/**
	 * One batch, deliberately: separate .run() calls each commit on their own, so a scope
	 * insert failing after the key row landed would leave a key with a partial snapshot --
	 * and an empty snapshot means "mints nothing", on a credential already shown to the
	 * operator. Atomic here means the only outcomes are a whole key or no key.
	 */
	async create(row: ApiKeyRow, clientScopeIds: string[]): Promise<void> {
		const insertKey = this.db
			.prepare(
				[
					"INSERT INTO api_keys",
					"(id, key_id, key_hash, client_id, user_id, name, created_by, created_at, expires_at)",
					"VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
				].join(" ")
			)
			.bind(
				row.id,
				row.key_id,
				row.key_hash,
				row.client_id,
				row.user_id,
				row.name,
				row.created_by,
				row.created_at,
				row.expires_at
			);
		const insertScope = this.db.prepare(
			"INSERT INTO api_key_scopes (id, api_key_id, client_scope_id) VALUES (?, ?, ?)"
		);
		const scopeStatements = clientScopeIds
			.filter(Boolean)
			.map((clientScopeId) => insertScope.bind(crypto.randomUUID(), row.id, clientScopeId));
		await this.db.batch([insertKey, ...scopeStatements]);
	}

	async revoke(id: string, revokedAt: string): Promise<void> {
		// Guarded on IS NULL so re-revoking cannot overwrite the original timestamp.
		await this.db
			.prepare("UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL")
			.bind(revokedAt, id)
			.run();
	}

	async updateHash(id: string, keyHash: string): Promise<void> {
		await this.db.prepare("UPDATE api_keys SET key_hash = ? WHERE id = ?").bind(keyHash, id).run();
	}

	async touchLastUsed(id: string, lastUsedAt: string): Promise<void> {
		await this.db
			.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?")
			.bind(lastUsedAt, id)
			.run();
	}

	async getScopeGrants(apiKeyId: string): Promise<ClientScopeGrant[]> {
		const result = await this.db
			.prepare(
				[
					"SELECT cs.id AS clientScopeId, cs.scope_id AS scopeId, s.scope_name AS scopeName",
					"FROM api_key_scopes aks",
					"INNER JOIN client_scopes cs ON cs.id = aks.client_scope_id",
					"INNER JOIN scopes s ON s.id = cs.scope_id",
					"WHERE aks.api_key_id = ?",
					"ORDER BY s.scope_name",
				].join(" ")
			)
			.bind(apiKeyId)
			.all<ClientScopeGrant>();
		return result.results ?? [];
	}
}
