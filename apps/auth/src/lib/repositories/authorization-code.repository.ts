export interface AuthorizationCode {
	id: string;
	codeId: string;
	clientId: string;
	redirectUri: string;
	codeChallenge: string;
	codeChallengeMethod: string;
	subject: string;
	nonce: string | null;
	authTime: string | null;
	expiresAt: string;
	usedAt: string | null;
	createdAt: string;
}

export interface AuthorizationCodeWithScopeIds extends AuthorizationCode {
	clientScopeIds: string[];
}

export interface AuthorizationCodeRow {
	id: string;
	code_id: string;
	client_id: string;
	redirect_uri: string;
	code_challenge: string;
	code_challenge_method: string;
	subject: string;
	nonce: string | null;
	auth_time: string | null;
	expires_at: string;
	used_at: string | null;
	created_at: string;
}

export interface AuthorizationCodeRepository {
	create(row: AuthorizationCodeRow, clientScopeIds: string[]): Promise<void>;
	getByCodeId(codeId: string): Promise<AuthorizationCodeWithScopeIds | null>;
	/**
	 * Atomically consume the code. Returns true only if THIS call transitioned it from
	 * unused → used; false if it was already used (lost the race / replay). Callers must
	 * issue tokens only when this returns true.
	 */
	markUsed(id: string, usedAt: string): Promise<boolean>;
	deleteUsedOrExpired(nowIso: string): Promise<number>;
}
