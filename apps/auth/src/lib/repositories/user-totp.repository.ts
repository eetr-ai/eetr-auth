export interface UserTotpRow {
	userId: string;
	/** Base32 TOTP secret, encrypted at rest (see lib/crypto/secret-box). */
	secretEnc: string;
	/** NULL while enrollment is pending; set once the user verifies their first code. */
	confirmedAt: string | null;
	createdAt: string;
	lastUsedAt: string | null;
}

export interface UserTotpRepository {
	get(userId: string): Promise<UserTotpRow | null>;
	/** Inserts or replaces the user's enrollment in a pending (unconfirmed) state. */
	upsertPending(params: { userId: string; secretEnc: string; createdAt: string }): Promise<void>;
	confirm(userId: string, confirmedAtIso: string): Promise<void>;
	delete(userId: string): Promise<void>;
	touchLastUsed(userId: string, whenIso: string): Promise<void>;
}
