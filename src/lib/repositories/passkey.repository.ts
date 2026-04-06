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
	updateCredentialCounter(credentialId: string, counter: number): Promise<void>;
	deleteCredential(credentialId: string): Promise<void>;
	hasCredentialForUser(userId: string): Promise<boolean>;

	// Exchange tokens
	insertExchangeToken(row: PasskeyExchangeTokenRow): Promise<void>;
	consumeExchangeToken(id: string): Promise<PasskeyExchangeTokenRow | null>;
}
