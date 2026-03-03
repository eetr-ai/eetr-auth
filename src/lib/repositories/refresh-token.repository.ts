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
}

export interface RefreshTokenActivity {
	tokenType: "refresh";
	id: string;
	tokenId: string;
	clientId: string;
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
	revoke(id: string, revokedAt: string): Promise<void>;
	listRefreshTokenActivity(clientId?: string): Promise<RefreshTokenActivity[]>;
}
