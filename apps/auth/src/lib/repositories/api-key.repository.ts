import type { ClientScopeGrant } from "./token.repository";

/**
 * A long-lived API key: a per-(client, user) credential a machine caller exchanges for a
 * short-lived access token at POST /api/token/api-key.
 *
 * `keyHash` is deliberately NOT on this type. It is an Argon2id digest that only
 * {@link ApiKeyRepository.getByKeyId} needs, and every other surface (admin API, dashboard,
 * audit log) reads these rows, so leaving it off makes leaking it the exception rather than
 * something each caller has to remember to strip.
 */
export interface ApiKey {
	id: string;
	/** Public lookup handle -- the middle segment of `eak_<keyId>_<secret>`. */
	keyId: string;
	/** clients.id (the internal row id), not clients.client_id. */
	clientId: string;
	userId: string;
	/** Username of the bound user, for display. */
	userDisplay: string;
	name: string | null;
	createdBy: string;
	createdAt: string;
	/** null = never expires. */
	expiresAt: string | null;
	revokedAt: string | null;
	lastUsedAt: string | null;
}

/** {@link ApiKey} plus the digest, returned only by the authentication lookup. */
export interface ApiKeyWithHash extends ApiKey {
	keyHash: string;
}

export interface ApiKeyRow {
	id: string;
	key_id: string;
	key_hash: string;
	client_id: string;
	user_id: string;
	name: string | null;
	created_by: string | null;
	created_at: string;
	expires_at: string | null;
}

export interface ApiKeyRepository {
	listByClient(clientId: string): Promise<ApiKey[]>;
	getById(id: string): Promise<ApiKey | null>;
	/** The authentication path: the only method that returns the stored digest. */
	getByKeyId(keyId: string): Promise<ApiKeyWithHash | null>;
	create(row: ApiKeyRow, clientScopeIds: string[]): Promise<void>;
	revoke(id: string, revokedAt: string): Promise<void>;
	/**
	 * Lazy re-hash, mirroring ClientRepository.updateSecret: a row stored under an older
	 * HASH_METHOD is upgraded in place the first time it verifies successfully.
	 */
	updateHash(id: string, keyHash: string): Promise<void>;
	touchLastUsed(id: string, lastUsedAt: string): Promise<void>;
	/**
	 * The key's scope subset, always materialized at creation. Empty therefore means every
	 * scope it held has since been ungranted from the client and cascaded away (ON DELETE
	 * CASCADE from client_scopes) -- never "unset, so grant everything".
	 */
	getScopeGrants(apiKeyId: string): Promise<ClientScopeGrant[]>;
}
