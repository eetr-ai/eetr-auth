export interface RefreshTokenRow {
	id: string;
	refresh_token_id: string;
	client_id: string;
	subject: string | null;
	access_token_id: string | null;
	expires_at: string;
	revoked_at: string | null;
	rotated_from_id: string | null;
	created_at: string;
	// RFC 8707 resource carried through refresh so rotated access tokens keep the same aud.
	resource: string | null;
}

export interface RefreshTokenRecord {
	id: string;
	refreshTokenId: string;
	clientId: string;
	subject: string | null;
	accessTokenId: string | null;
	expiresAt: string;
	revokedAt: string | null;
	rotatedFromId: string | null;
	createdAt: string;
	clientScopeIds: string[];
	// RFC 8707 audience bound at authorize time; carried forward on refresh.
	resource: string | null;
}

export interface RefreshTokenActivity {
	tokenType: "refresh";
	id: string;
	tokenId: string;
	clientId: string;
	clientName: string | null;
	environmentId: string;
	expiresAt: string;
	createdAt: string;
	revokedAt: string | null;
	rotatedFromTokenId: string | null;
	status: "active" | "expired" | "revoked";
	scopeNames: string[];
}

export interface RefreshTokenRepository {
	createRefreshToken(row: RefreshTokenRow, clientScopeIds: string[]): Promise<void>;
	getByTokenId(refreshTokenId: string): Promise<RefreshTokenRecord | null>;
	/**
	 * Atomically revoke a single token. Returns true only if THIS call transitioned it
	 * from active → revoked; false if it was already revoked (concurrent rotation / reuse).
	 */
	revoke(id: string, revokedAt: string): Promise<boolean>;
	/**
	 * Revoke the entire rotation family reachable from `rootId` (all ancestors and
	 * descendants linked via `rotated_from_id`). Used to cascade-revoke on detected
	 * refresh-token reuse (OAuth 2.1 §4.3.1). Returns how many members it revoked.
	 */
	revokeFamily(rootId: string, revokedAt: string): Promise<number>;
	/**
	 * Returns the access-token row ids (tokens.id) bound to every member of the rotation
	 * family reachable from `rootId`. Used alongside {@link revokeFamily} to also kill the
	 * access tokens issued across the family on detected reuse.
	 */
	listFamilyAccessTokenIds(rootId: string): Promise<string[]>;
	listRefreshTokenActivity(clientId?: string): Promise<RefreshTokenActivity[]>;
	deleteByTokenId(refreshTokenId: string): Promise<boolean>;
	deleteExpired(nowIso: string): Promise<number>;
	deleteRevoked(): Promise<number>;
}
