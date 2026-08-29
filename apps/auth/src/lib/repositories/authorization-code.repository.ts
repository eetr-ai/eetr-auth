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
	// RFC 8707 resource requested at /authorize and bound to this code. NULL = none.
	resource: string | null;
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
	resource: string | null;
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
	/**
	 * Delete still-unused codes issued to `subject` for `clientId`. Used when consent is
	 * withdrawn, so a code minted moments earlier cannot still be exchanged for a token.
	 * Returns how many were deleted.
	 */
	deleteUnusedForSubjectAndClient(subject: string, clientId: string): Promise<number>;
	deleteUsedOrExpired(nowIso: string): Promise<number>;
}
