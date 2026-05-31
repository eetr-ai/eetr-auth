export interface PasskeyChallengeRow {
	id: string;
	userId: string | null;
	challenge: string; // base64url
	kind: "registration" | "authentication";
	expiresAt: string; // ISO
}

export interface PasskeyCredentialRow {
	id: string;
	userId: string;
	credentialId: string; // base64url
	publicKey: string; // base64url COSE key
	counter: number;
	deviceType: string;
	backedUp: boolean;
	transports: string | null; // JSON array string
	name: string | null; // user-editable label, e.g. "Chrome on macOS"
	lastUsedAt: string | null; // ISO, updated on each verified ceremony
	createdAt: string; // ISO
}

export interface PasskeyExchangeTokenRow {
	id: string;
	userId: string;
	expiresAt: string; // ISO
	usedAt: string | null;
}

export interface PasskeyRepository {
	// Challenges
	insertChallenge(row: PasskeyChallengeRow): Promise<void>;
	getChallengeById(id: string): Promise<PasskeyChallengeRow | null>;
	deleteChallenge(id: string): Promise<void>;
	deleteExpiredChallenges(beforeIso: string): Promise<number>;

	// Credentials
	insertCredential(row: PasskeyCredentialRow): Promise<void>;
	findCredentialById(credentialId: string): Promise<PasskeyCredentialRow | null>;
	findCredentialsByUserId(userId: string): Promise<PasskeyCredentialRow[]>;
	/** Look up a credential by its row id, scoped to its owner (IDOR-safe). */
	findCredentialByRowIdForUser(rowId: string, userId: string): Promise<PasskeyCredentialRow | null>;
	updateCredentialCounter(credentialId: string, counter: number, lastUsedAt: string): Promise<void>;
	deleteCredential(credentialId: string): Promise<void>;
	/** Delete a credential by row id scoped to its owner. Returns true if a row was removed. */
	deleteCredentialForUser(userId: string, rowId: string): Promise<boolean>;
	/** Rename a credential by row id scoped to its owner. Returns true if a row was updated. */
	renameCredential(userId: string, rowId: string, name: string): Promise<boolean>;
	hasCredentialForUser(userId: string): Promise<boolean>;

	// Exchange tokens
	insertExchangeToken(row: PasskeyExchangeTokenRow): Promise<void>;
	consumeExchangeToken(id: string): Promise<PasskeyExchangeTokenRow | null>;
}
