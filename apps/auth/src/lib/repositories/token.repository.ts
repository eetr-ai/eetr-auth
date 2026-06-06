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
