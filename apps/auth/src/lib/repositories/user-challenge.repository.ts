export type UserChallengeKind = "mfa_otp" | "password_reset" | "email_verification";

export interface UserChallengeRow {
	id: string;
	userId: string;
	kind: UserChallengeKind;
	codeHash: string | null;
	expiresAt: string;
	createdAt: string;
	consumedAt: string | null;
	otpFailedAttempts: number;
}

export interface UserChallengeRepository {
	insert(
		row: Omit<UserChallengeRow, "consumedAt" | "otpFailedAttempts"> & { consumedAt?: null }
	): Promise<void>;
	getById(id: string): Promise<UserChallengeRow | null>;
	deleteById(id: string): Promise<void>;
	deleteByUserIdAndKind(userId: string, kind: UserChallengeKind): Promise<void>;
	markConsumed(id: string, consumedAtIso: string): Promise<void>;
	deleteExpiredBefore(iso: string): Promise<number>;
	/** Increments MFA OTP failure count; returns new total or null if row missing. */
	incrementOtpFailedAttempts(id: string): Promise<number | null>;
}
