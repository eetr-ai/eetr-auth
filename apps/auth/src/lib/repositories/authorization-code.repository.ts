export interface AuthorizationCode {
	id: string;
	codeId: string;
	clientId: string;
	redirectUri: string;
	codeChallenge: string;
	codeChallengeMethod: string;
	subject: string;
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
	expires_at: string;
	used_at: string | null;
	created_at: string;
}

export interface AuthorizationCodeRepository {
	create(row: AuthorizationCodeRow, clientScopeIds: string[]): Promise<void>;
	getByCodeId(codeId: string): Promise<AuthorizationCodeWithScopeIds | null>;
	markUsed(id: string, usedAt: string): Promise<void>;
	deleteUsedOrExpired(nowIso: string): Promise<number>;
}
