export interface ClientScopeGrant {
	clientScopeId: string;
	scopeId: string;
	scopeName: string;
}

export interface AccessTokenRow {
	id: string;
	token_id: string;
	client_id: string;
	expires_at: string;
	// RFC 8707 resource indicator: the audience the token was minted for. NULL = the
	// legacy default (the owning client's client_id).
	resource: string | null;
	// Provenance: the api_keys row this token was minted from, or NULL for every OAuth
	// grant. Optional so existing callers are unchanged.
	api_key_id?: string | null;
}

export interface AccessTokenActivity {
	tokenType: "access";
	id: string;
	tokenId: string;
	clientId: string;
	clientName: string | null;
	environmentId: string;
	expiresAt: string;
	status: "active" | "expired";
	scopeNames: string[];
}

export interface AccessTokenRecord {
	id: string;
	tokenId: string;
	clientId: string;
	environmentId: string;
	environmentName: string;
	expiresAt: string;
	scopeNames: string[];
	// RFC 8707 audience the token was minted for; NULL = default (client_id).
	resource: string | null;
	// Non-null when POST /api/token/api-key minted this token, naming the api_keys row.
	// Lets a caller tell a machine-credential token from an interactive one.
	apiKeyId: string | null;
}

export interface TokenRepository {
	createAccessToken(row: AccessTokenRow, clientScopeIds: string[]): Promise<void>;
	getClientScopeGrants(clientId: string): Promise<ClientScopeGrant[]>;
	getClientScopeGrantsByNames(clientId: string, scopeNames: string[]): Promise<ClientScopeGrant[]>;
	getAccessTokenByTokenId(tokenId: string): Promise<AccessTokenRecord | null>;
	listAccessTokenActivity(clientId?: string): Promise<AccessTokenActivity[]>;
	revokeAccessTokenByTokenId(tokenId: string, expiresAt: string): Promise<boolean>;
	/**
	 * Force-expire access tokens by their row id (tokens.id), never extending a token
	 * that already expires sooner. Used to kill the access tokens bound to a revoked
	 * refresh-token family on detected reuse. Returns how many rows it shortened.
	 */
	expireAccessTokensByIds(ids: string[], expiresAt: string): Promise<number>;
	deleteAccessTokenByTokenId(tokenId: string): Promise<boolean>;
	deleteExpiredAccessTokens(nowIso: string): Promise<number>;
}
