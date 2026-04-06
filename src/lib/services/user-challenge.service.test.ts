import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { UserRepository, UserWithPassword } from "@/lib/repositories/admin.repository";
import type { SiteSettingsRepository } from "@/lib/repositories/site-settings.repository";
import type { UserChallengeRepository, UserChallengeRow } from "@/lib/repositories/user-challenge.repository";
import { hashPassword, verifyPassword } from "@/lib/auth/password-hash";
import { verifyPasswordResetJwt } from "@/lib/auth/password-reset-jwt";
import { UserChallengeService } from "@/lib/services/user-challenge.service";

vi.mock("@/lib/auth/password-hash", () => ({
	hashPassword: vi.fn(),
	verifyPassword: vi.fn(),
}));

vi.mock("@/lib/auth/password-reset-jwt", async () => {
	const actual = await vi.importActual<typeof import("@/lib/auth/password-reset-jwt")>(
		"@/lib/auth/password-reset-jwt"
	);
	return {
		...actual,
		signPasswordResetJwt: vi.fn(),
		verifyPasswordResetJwt: vi.fn(),
	};
});

const verifyPasswordMock = vi.mocked(verifyPassword);
const hashPasswordMock = vi.mocked(hashPassword);
const verifyPasswordResetJwtMock = vi.mocked(verifyPasswordResetJwt);

function createUserRepoMock() {
	return {
		create: vi.fn(),
		list: vi.fn(),
		findByUsername: vi.fn(),
		findByEmail: vi.fn(),
		getById: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
	} satisfies UserRepository;
}

function createChallengeRepoMock() {
	return {
		insert: vi.fn(),
		getById: vi.fn(),
		deleteById: vi.fn(),
		markConsumed: vi.fn(),
		deleteExpiredBefore: vi.fn(),
		incrementOtpFailedAttempts: vi.fn(),
	} satisfies UserChallengeRepository;
}

function createSiteRepoMock() {
	return {
		get: vi.fn(),
		update: vi.fn(),
	} satisfies SiteSettingsRepository;
}

function createSiteSettingsMock() {
	return {
		getEmailLogoAbsoluteUrl: vi.fn().mockReturnValue("https://cdn.example.com/logo.png"),
		getDisplaySiteTitle: vi.fn().mockReturnValue("Test Auth"),
	};
}

function createMailMock() {
	return {
		getResendApiKey: vi.fn().mockReturnValue("resend-key"),
		fromAddress: vi.fn().mockReturnValue("no-reply@example.com"),
		send: vi.fn(),
	};
}

function createService(deps?: {
	userRepo?: UserRepository;
	challengeRepo?: UserChallengeRepository;
	siteRepo?: SiteSettingsRepository;
	siteSettings?: ReturnType<typeof createSiteSettingsMock>;
	mail?: ReturnType<typeof createMailMock>;
	env?: CloudflareEnv;
}) {
	return new UserChallengeService({
		userRepo: deps?.userRepo ?? createUserRepoMock(),
		challengeRepo: deps?.challengeRepo ?? createChallengeRepoMock(),
		siteRepo: deps?.siteRepo ?? createSiteRepoMock(),
		siteSettings: deps?.siteSettings ?? createSiteSettingsMock(),
		mail: deps?.mail ?? createMailMock(),
		env:
			deps?.env ??
			({
				ARGON_HASHER: { fetch: vi.fn() },
				HASH_METHOD: "argon",
				MFA_OTP_MAX_ATTEMPTS: "3",
			} as unknown as CloudflareEnv),
	});
}

function makeUser(overrides?: Partial<UserWithPassword>): UserWithPassword {
	return {
		id: "user-1",
		username: "alice",
		name: "Alice",
		email: "alice@example.com",
		avatarKey: null,
		passwordHash: "stored-hash",
		isAdmin: false,
		...overrides,
	};
}

function makeChallenge(overrides?: Partial<UserChallengeRow>): UserChallengeRow {
	return {
		id: "challenge-1",
		userId: "user-1",
		kind: "mfa_otp",
		codeHash: "hash",
		expiresAt: "2026-04-06T13:20:00.000Z",
		createdAt: "2026-04-06T13:10:00.000Z",
		consumedAt: null,
		otpFailedAttempts: 0,
		...overrides,
	};
}

async function hashOtpForTest(challengeId: string, code: string): Promise<string> {
	const raw = `${challengeId}:${code}:${process.env.AUTH_SECRET}`;
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
	return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

describe("UserChallengeService", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-06T13:10:00.000Z"));
		vi.spyOn(console, "info").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		verifyPasswordMock.mockReset();
		hashPasswordMock.mockReset();
		verifyPasswordResetJwtMock.mockReset();
	});

	describe("verifyUsernamePassword", () => {
		it("returns null when the user does not exist", async () => {
			const userRepo = createUserRepoMock();
			userRepo.findByUsername.mockResolvedValue(null);
			const service = createService({ userRepo });

			await expect(service.verifyUsernamePassword("alice", "password")).resolves.toBeNull();
			expect(verifyPasswordMock).not.toHaveBeenCalled();
		});

		it("returns null when password verification fails", async () => {
			const userRepo = createUserRepoMock();
			userRepo.findByUsername.mockResolvedValue(makeUser());
			verifyPasswordMock.mockResolvedValue({ ok: false });
			const service = createService({ userRepo });

			await expect(service.verifyUsernamePassword("alice", "wrong")).resolves.toBeNull();
			expect(userRepo.update).not.toHaveBeenCalled();
		});

		it("returns the user when password verification succeeds", async () => {
			const userRepo = createUserRepoMock();
			const user = makeUser();
			userRepo.findByUsername.mockResolvedValue(user);
			verifyPasswordMock.mockResolvedValue({ ok: true });
			const service = createService({ userRepo });

			await expect(service.verifyUsernamePassword("alice", "password")).resolves.toBe(user);
		});

		it("updates the stored password hash when verification returns a rehash", async () => {
			const userRepo = createUserRepoMock();
			const user = makeUser({ passwordHash: "legacy-md5" });
			userRepo.findByUsername.mockResolvedValue(user);
			verifyPasswordMock.mockResolvedValue({ ok: true, rehash: "$argon2id$new-hash" });
			const service = createService({ userRepo });

			const result = await service.verifyUsernamePassword("alice", "password");

			expect(userRepo.update).toHaveBeenCalledWith("user-1", { passwordHash: "$argon2id$new-hash" });
			expect(result?.passwordHash).toBe("$argon2id$new-hash");
		});
	});

	describe("verifyMfaOtpAndConsume", () => {
		it("returns challenge_missing_or_mismatch when the challenge is missing or mismatched", async () => {
			const challengeRepo = createChallengeRepoMock();
			challengeRepo.getById.mockResolvedValue(makeChallenge({ kind: "password_reset" }));
			const service = createService({ challengeRepo });

			await expect(service.verifyMfaOtpAndConsume("challenge-1", "user-1", "123456")).resolves.toEqual({
				ok: false,
				reason: "challenge_missing_or_mismatch",
			});
		});

		it("returns challenge_consumed when the challenge was already consumed", async () => {
			const challengeRepo = createChallengeRepoMock();
			challengeRepo.getById.mockResolvedValue(makeChallenge({ consumedAt: "2026-04-06T13:09:00.000Z" }));
			const service = createService({ challengeRepo });

			await expect(service.verifyMfaOtpAndConsume("challenge-1", "user-1", "123456")).resolves.toEqual({
				ok: false,
				reason: "challenge_consumed",
			});
		});

		it("returns challenge_expired and deletes the challenge when it is expired", async () => {
			const challengeRepo = createChallengeRepoMock();
			challengeRepo.getById.mockResolvedValue(makeChallenge({ expiresAt: "2026-04-06T13:09:00.000Z" }));
			const service = createService({ challengeRepo });

			await expect(service.verifyMfaOtpAndConsume("challenge-1", "user-1", "123456")).resolves.toEqual({
				ok: false,
				reason: "challenge_expired",
			});
			expect(challengeRepo.deleteById).toHaveBeenCalledWith("challenge-1");
		});

		it("returns otp_incorrect and increments failures on the wrong code", async () => {
			const challengeRepo = createChallengeRepoMock();
			challengeRepo.getById.mockResolvedValue(
				makeChallenge({ codeHash: await hashOtpForTest("challenge-1", "654321") })
			);
			challengeRepo.incrementOtpFailedAttempts.mockResolvedValue(1);
			const service = createService({ challengeRepo });

			await expect(service.verifyMfaOtpAndConsume("challenge-1", "user-1", "123456")).resolves.toEqual({
				ok: false,
				reason: "otp_incorrect",
			});
			expect(challengeRepo.incrementOtpFailedAttempts).toHaveBeenCalledWith("challenge-1");
			expect(challengeRepo.deleteById).not.toHaveBeenCalled();
		});

		it("returns otp_max_attempts_exceeded and deletes the challenge when max attempts are reached", async () => {
			const challengeRepo = createChallengeRepoMock();
			challengeRepo.getById.mockResolvedValue(
				makeChallenge({ codeHash: await hashOtpForTest("challenge-1", "654321") })
			);
			challengeRepo.incrementOtpFailedAttempts.mockResolvedValue(3);
			const service = createService({ challengeRepo });

			await expect(service.verifyMfaOtpAndConsume("challenge-1", "user-1", "123456")).resolves.toEqual({
				ok: false,
				reason: "otp_max_attempts_exceeded",
			});
			expect(challengeRepo.deleteById).toHaveBeenCalledWith("challenge-1");
		});

		it("returns ok and deletes the challenge when the code is correct", async () => {
			const challengeRepo = createChallengeRepoMock();
			challengeRepo.getById.mockResolvedValue(
				makeChallenge({ codeHash: await hashOtpForTest("challenge-1", "123456") })
			);
			const service = createService({ challengeRepo });

			await expect(service.verifyMfaOtpAndConsume("challenge-1", "user-1", "123456")).resolves.toEqual({
				ok: true,
			});
			expect(challengeRepo.deleteById).toHaveBeenCalledWith("challenge-1");
		});
	});

	describe("completePasswordReset", () => {
		it("propagates invalid JWT errors", async () => {
			verifyPasswordResetJwtMock.mockRejectedValue(new Error("bad token"));
			const service = createService();

			await expect(service.completePasswordReset("token", "new-password")).rejects.toThrow("bad token");
		});

		it("rejects missing or mismatched challenges", async () => {
			const challengeRepo = createChallengeRepoMock();
			verifyPasswordResetJwtMock.mockResolvedValue({ challengeId: "challenge-1", userId: "user-1" });
			challengeRepo.getById.mockResolvedValue(null);
			const service = createService({ challengeRepo });

			await expect(service.completePasswordReset("token", "new-password")).rejects.toThrow(
				"Invalid or expired reset link."
			);
		});

		it("rejects already-used reset links", async () => {
			const challengeRepo = createChallengeRepoMock();
			verifyPasswordResetJwtMock.mockResolvedValue({ challengeId: "challenge-1", userId: "user-1" });
			challengeRepo.getById.mockResolvedValue(
				makeChallenge({ kind: "password_reset", consumedAt: "2026-04-06T13:09:00.000Z" })
			);
			const service = createService({ challengeRepo });

			await expect(service.completePasswordReset("token", "new-password")).rejects.toThrow(
				"This reset link has already been used."
			);
		});

		it("rejects expired reset links", async () => {
			const challengeRepo = createChallengeRepoMock();
			verifyPasswordResetJwtMock.mockResolvedValue({ challengeId: "challenge-1", userId: "user-1" });
			challengeRepo.getById.mockResolvedValue(
				makeChallenge({ kind: "password_reset", expiresAt: "2026-04-06T13:09:00.000Z" })
			);
			const service = createService({ challengeRepo });

			await expect(service.completePasswordReset("token", "new-password")).rejects.toThrow(
				"This reset link has expired."
			);
		});

		it("updates the password hash and consumes the challenge on success", async () => {
			const userRepo = createUserRepoMock();
			const challengeRepo = createChallengeRepoMock();
			const env = {
				ARGON_HASHER: { fetch: vi.fn() },
				HASH_METHOD: "argon",
			} as unknown as CloudflareEnv;
			verifyPasswordResetJwtMock.mockResolvedValue({ challengeId: "challenge-1", userId: "user-1" });
			challengeRepo.getById.mockResolvedValue(makeChallenge({ kind: "password_reset" }));
			hashPasswordMock.mockResolvedValue("$argon2id$new-hash");
			const service = createService({ userRepo, challengeRepo, env });

			await service.completePasswordReset("token", "new-password");

			expect(hashPasswordMock).toHaveBeenCalledWith("new-password", {
				argonHasher: env.ARGON_HASHER,
				hashMethod: "argon",
			});
			expect(userRepo.update).toHaveBeenCalledWith("user-1", { passwordHash: "$argon2id$new-hash" });
			expect(challengeRepo.markConsumed).toHaveBeenCalledWith(
				"challenge-1",
				"2026-04-06T13:10:00.000Z"
			);
		});
	});

	describe("requestPasswordReset", () => {
		it("silently completes when the email does not match a user", async () => {
			const userRepo = createUserRepoMock();
			const challengeRepo = createChallengeRepoMock();
			const mail = createMailMock();
			userRepo.findByEmail.mockResolvedValue(null);
			const service = createService({ userRepo, challengeRepo, mail });

			await expect(service.requestPasswordReset("missing@example.com")).resolves.toBeUndefined();
			expect(challengeRepo.insert).not.toHaveBeenCalled();
			expect(mail.send).not.toHaveBeenCalled();
		});
	});
});