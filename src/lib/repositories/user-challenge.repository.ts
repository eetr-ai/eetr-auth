export type UserChallengeKind = "mfa_otp" | "password_reset";

export interface UserChallengeRow {
	id: string;
	userId: string;
	kind: UserChallengeKind;
	codeHash: string | null;
	expiresAt: string;
	createdAt: string;
	consumedAt: string | null;
}

export interface UserChallengeRepository {
	insert(row: Omit<UserChallengeRow, "consumedAt"> & { consumedAt?: null }): Promise<void>;
	getById(id: string): Promise<UserChallengeRow | null>;
	deleteById(id: string): Promise<void>;
	markConsumed(id: string, consumedAtIso: string): Promise<void>;
	deleteExpiredBefore(iso: string): Promise<number>;
}
