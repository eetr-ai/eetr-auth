import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { UserRecord, UserRepository } from "@/lib/repositories/admin.repository";
import type { AdminAuditLogRepository } from "@/lib/repositories/admin-audit-log.repository";
import type { UserChallengeRepository } from "@/lib/repositories/user-challenge.repository";
import type { SiteSettingsRepository } from "@/lib/repositories/site-settings.repository";
import { hashPassword } from "@/lib/auth/password-hash";
import { UserService } from "@/lib/services/user.service";
import { AdminAuditLogService } from "@/lib/services/admin-audit-log.service";

vi.mock("@/lib/auth/password-hash", () => ({
	hashPassword: vi.fn().mockResolvedValue("hashed-password"),
}));

// @/lib/users/profile is deliberately not mocked: it is pure, and a partial mock
// of it is how the avatar-URL helpers went missing here in the first place.

function createUserRepoMock(): UserRepository {
	return {
		create: vi.fn(),
		list: vi.fn(),
		findByUsername: vi.fn(),
		findByEmail: vi.fn(),
		getById: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
		listTestUsersByEnvironment: vi.fn().mockResolvedValue([]),
		getUserEnvironments: vi.fn().mockResolvedValue([]),
		setUserEnvironments: vi.fn(),
		deleteWithAudit: vi.fn(),
	};
}

function createChallengeRepoMock(): UserChallengeRepository {
	return {
		insert: vi.fn(),
		getById: vi.fn(),
		deleteById: vi.fn(),
		deleteByUserIdAndKind: vi.fn(),
		markConsumed: vi.fn(),
		deleteExpiredBefore: vi.fn(),
		incrementOtpFailedAttempts: vi.fn(),
	};
}

function createAuditLogService(insert = vi.fn()): AdminAuditLogService {
	const logRepo: AdminAuditLogRepository = {
		insert,
		listLogs: vi.fn(),
	};
	return new AdminAuditLogService({ logRepo });
}

function createSiteSettingsRepo(cdnUrl: string | null): SiteSettingsRepository {
	return {
		get: vi.fn().mockResolvedValue({
			siteTitle: null,
			siteUrl: null,
			cdnUrl,
			logoKey: null,
			mfaEnabled: false,
			adminPasswordPolicyId: null,
		}),
		update: vi.fn(),
	};
}

function createService(
	userRepository: UserRepository,
	adminAuditLogService: AdminAuditLogService = createAuditLogService(),
	siteSettingsRepository?: SiteSettingsRepository
): UserService {
	return new UserService({
		userRepository,
		adminAuditLogService,
		avatarCdnBaseUrl: "https://cdn.example.com",
		siteSettingsRepository,
		argonHasher: { fetch: vi.fn() } as unknown as Fetcher,
		hashMethod: "argon",
	});
}

function makeUserRecord(overrides?: Partial<UserRecord>): UserRecord {
	return {
		id: "user-1",
		username: "alice",
		name: "Alice",
		email: "alice@example.com",
		emailVerifiedAt: null,
		avatarKey: null,
		isAdmin: false,
		isTestUser: false,
		...overrides,
	};
}

describe("UserService", () => {
	let mockRepo: UserRepository;

	beforeEach(() => {
		mockRepo = createUserRepoMock();
		vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("new-user-id");
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("listUsers", () => {
		it("returns an empty array when there are no users", async () => {
			vi.mocked(mockRepo.list).mockResolvedValue([]);
			const service = createService(mockRepo);
			await expect(service.listUsers()).resolves.toEqual([]);
		});

		it("maps avatar URLs onto each user", async () => {
			vi.mocked(mockRepo.list).mockResolvedValue([
				makeUserRecord({ avatarKey: "avatar.png" }),
				makeUserRecord({ id: "user-2", username: "bob" }),
			]);
			const service = createService(mockRepo);
			const result = await service.listUsers();
			expect(result[0].avatarUrl).toBe("https://cdn.example.com/avatar.png");
			expect(result[1].avatarUrl).toBeNull();
		});

		it("prefers the CDN URL from site settings over the environment default", async () => {
			// Avatars used to resolve from the environment alone, so the CDN URL in
			// Setup → Site identity moved the logo but not the pictures.
			vi.mocked(mockRepo.list).mockResolvedValue([makeUserRecord({ avatarKey: "avatar.png" })]);
			const siteSettingsRepository = createSiteSettingsRepo("https://cdn.site.example");
			const service = createService(mockRepo, undefined, siteSettingsRepository);

			const result = await service.listUsers();

			expect(result[0].avatarUrl).toBe("https://cdn.site.example/avatar.png");
		});

		it("falls back to the environment default when no CDN URL is configured", async () => {
			vi.mocked(mockRepo.list).mockResolvedValue([makeUserRecord({ avatarKey: "avatar.png" })]);
			const service = createService(mockRepo, undefined, createSiteSettingsRepo(null));

			const result = await service.listUsers();

			expect(result[0].avatarUrl).toBe("https://cdn.example.com/avatar.png");
		});

		it("reads site settings once per instance, not once per avatar", async () => {
			// Services are built per request, so the memoised read keeps a listing at
			// one query no matter how many users have a picture.
			vi.mocked(mockRepo.list).mockResolvedValue([
				makeUserRecord({ avatarKey: "a.png" }),
				makeUserRecord({ id: "user-2", username: "bob", avatarKey: "b.png" }),
				makeUserRecord({ id: "user-3", username: "carol", avatarKey: "c.png" }),
			]);
			const siteSettingsRepository = createSiteSettingsRepo("https://cdn.site.example");
			const service = createService(mockRepo, undefined, siteSettingsRepository);

			await service.listUsers();

			expect(siteSettingsRepository.get).toHaveBeenCalledTimes(1);
		});
	});

	describe("getById", () => {
		it("returns null when the user does not exist", async () => {
			vi.mocked(mockRepo.getById).mockResolvedValue(null);
			const service = createService(mockRepo);
			await expect(service.getById("missing")).resolves.toBeNull();
		});

		it("returns the user with an avatar URL when found", async () => {
			vi.mocked(mockRepo.getById).mockResolvedValue(makeUserRecord({ avatarKey: "pic.jpg" }));
			const service = createService(mockRepo);
			const result = await service.getById("user-1");
			expect(result?.id).toBe("user-1");
			expect(result?.avatarUrl).toBe("https://cdn.example.com/pic.jpg");
		});
	});

	describe("test users", () => {
		it("stores the empty sentinel and never reaches the hasher", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-04-07T12:00:00.000Z"));
			// hashPassword is a module-factory mock, so restoreAllMocks does not clear its
			// call history -- without this the assertion below would silently depend on no
			// earlier test in the file having hashed anything.
			vi.mocked(hashPassword).mockClear();
			const service = createService(mockRepo);

			const result = await service.createUser(
				"test_alice",
				"ignored",
				false,
				"Alice",
				null,
				"actor-1",
				{ isTestUser: true }
			);

			// Reaching hashPassword is not merely wasteful: it defaults to argon and throws
			// without an ARGON_HASHER binding, so a test user routed through it would fail to
			// create at all on any deployment that has not bound the hasher.
			expect(hashPassword).not.toHaveBeenCalled();
			expect(mockRepo.create).toHaveBeenCalledWith(
				"new-user-id",
				"test_alice",
				"Alice",
				null,
				null,
				// The empty sentinel: verifyPassword() matches it against neither the Argon2
				// PHC prefix nor the 32-hex MD5 shape, so no password can authenticate it.
				"",
				// No password was ever set, so the max-age gate has no clock to run.
				null,
				false,
				true
			);
			expect(result.isTestUser).toBe(true);
			vi.useRealTimers();
		});

		it("ignores the password argument entirely", async () => {
			const service = createService(mockRepo);

			await service.createUser("test_bob", "hunter2", false, null, null, null, {
				isTestUser: true,
			});

			expect(vi.mocked(mockRepo.create).mock.calls[0][5]).toBe("");
		});

		it("refuses to create a test user that is also an admin", async () => {
			const service = createService(mockRepo);

			await expect(
				service.createUser("test_root", "", true, null, null, null, { isTestUser: true })
			).rejects.toThrow("A test user cannot be an admin.");
			expect(mockRepo.create).not.toHaveBeenCalled();
		});

		it("creates a normal user with is_test_user = false by default", async () => {
			const service = createService(mockRepo);

			await service.createUser("carol", "secret", false);

			expect(vi.mocked(mockRepo.create).mock.calls[0][8]).toBe(false);
		});

		// The flag is immutable by construction -- it has no entry in UserUpdateInput -- so
		// this guards the type, not a runtime branch: if someone adds one, this stops compiling.
		it("does not expose isTestUser on the update path", async () => {
			mockRepo.getById = vi.fn().mockResolvedValue(makeUserRecord());
			const service = createService(mockRepo);

			await service.updateUser("user-1", { name: "Renamed" }, "actor-1");

			const patch = (mockRepo.update as ReturnType<typeof vi.fn>).mock.calls[0][1];
			expect(patch).not.toHaveProperty("isTestUser");
		});
	});

	describe("createUser", () => {
		it("throws when username is empty", async () => {
			const service = createService(mockRepo);
			await expect(service.createUser("   ", "password")).rejects.toThrow("Username is required");
		});

		it("creates an admin user with emailVerifiedAt set", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-04-07T12:00:00.000Z"));
			const service = createService(mockRepo);
			const result = await service.createUser("alice", "secret", true, "Alice", "alice@example.com");
			expect(mockRepo.create).toHaveBeenCalledWith(
				"new-user-id",
				"alice",
				"Alice",
				"alice@example.com",
				"2026-04-07T12:00:00.000Z",
				"hashed-password",
				"2026-04-07T12:00:00.000Z",
				true,
				false
			);
			expect(result.emailVerifiedAt).toBe("2026-04-07T12:00:00.000Z");
			expect(result.isAdmin).toBe(true);
			vi.useRealTimers();
		});

		it("creates an admin user with no email as unverified (emailVerifiedAt null)", async () => {
			const service = createService(mockRepo);
			const result = await service.createUser("carol", "secret", true);
			expect(result.email).toBeNull();
			expect(result.emailVerifiedAt).toBeNull();
			expect(result.isAdmin).toBe(true);
		});

		it("creates a non-admin user with emailVerifiedAt as null", async () => {
			const service = createService(mockRepo);
			const result = await service.createUser("bob", "secret", false);
			expect(result.emailVerifiedAt).toBeNull();
			expect(result.isAdmin).toBe(false);
		});

		it("trims the username before creating", async () => {
			const service = createService(mockRepo);
			await service.createUser("  alice  ", "secret");
			// Verify the second argument (username) is trimmed
			const calledUsername = vi.mocked(mockRepo.create).mock.calls[0]?.[1];
			expect(calledUsername).toBe("alice");
		});

		it("writes a user.create audit log entry with the acting user", async () => {
			const insert = vi.fn();
			const service = createService(mockRepo, createAuditLogService(insert));
			await service.createUser("alice", "secret", false, "Alice", "alice@example.com", "actor-1");
			expect(insert).toHaveBeenCalledWith(
				expect.objectContaining({
					action: "user.create",
					resource_type: "user",
					resource_id: "new-user-id",
					actor_user_id: "actor-1",
				})
			);
		});
	});

	describe("updateUser", () => {
		it("throws when the user is not found", async () => {
			vi.mocked(mockRepo.getById).mockResolvedValue(null);
			const service = createService(mockRepo);
			await expect(service.updateUser("missing", {}, "actor-1")).rejects.toThrow("User not found");
		});

		it("throws when updating username to an empty string", async () => {
			vi.mocked(mockRepo.getById).mockResolvedValue(makeUserRecord());
			const service = createService(mockRepo);
			await expect(service.updateUser("user-1", { username: "   " }, "actor-1")).rejects.toThrow(
				"Username is required"
			);
		});

		it("throws when an actor tries to remove their own admin access", async () => {
			vi.mocked(mockRepo.getById).mockResolvedValue(makeUserRecord({ id: "actor-1", isAdmin: true }));
			const service = createService(mockRepo);
			await expect(
				service.updateUser("actor-1", { isAdmin: false }, "actor-1")
			).rejects.toThrow("You cannot remove your own admin access");
		});

		it("throws when removing the last admin", async () => {
			vi.mocked(mockRepo.getById).mockResolvedValue(makeUserRecord({ id: "user-1", isAdmin: true }));
			vi.mocked(mockRepo.list).mockResolvedValue([makeUserRecord({ id: "user-1", isAdmin: true })]);
			const service = createService(mockRepo);
			await expect(
				service.updateUser("user-1", { isAdmin: false }, "actor-2")
			).rejects.toThrow("Cannot remove the last admin");
		});

		it("allows removing admin when another admin exists", async () => {
			const user = makeUserRecord({ id: "user-1", isAdmin: true });
			vi.mocked(mockRepo.getById)
				.mockResolvedValueOnce(user)
				.mockResolvedValueOnce({ ...user, isAdmin: false });
			vi.mocked(mockRepo.list).mockResolvedValue([
				makeUserRecord({ id: "user-1", isAdmin: true }),
				makeUserRecord({ id: "user-2", isAdmin: true }),
			]);
			const service = createService(mockRepo);
			const result = await service.updateUser("user-1", { isAdmin: false }, "actor-2");
			expect(mockRepo.update).toHaveBeenCalledWith("user-1", expect.objectContaining({ isAdmin: false }));
			expect(result.isAdmin).toBe(false);
		});

		it("clears emailVerifiedAt when email changes for a non-admin user", async () => {
			const user = makeUserRecord({ email: "old@example.com", emailVerifiedAt: "2026-01-01T00:00:00.000Z" });
			vi.mocked(mockRepo.getById)
				.mockResolvedValueOnce(user)
				.mockResolvedValueOnce({ ...user, email: "new@example.com", emailVerifiedAt: null });
			const service = createService(mockRepo);
			await service.updateUser("user-1", { email: "new@example.com" }, "actor-1");
			expect(mockRepo.update).toHaveBeenCalledWith(
				"user-1",
				expect.objectContaining({ emailVerifiedAt: null })
			);
		});

		it("does not clear emailVerifiedAt when email changes for an admin user", async () => {
			const user = makeUserRecord({ isAdmin: true, email: "old@example.com", emailVerifiedAt: "2026-01-01T00:00:00.000Z" });
			vi.mocked(mockRepo.getById)
				.mockResolvedValueOnce(user)
				.mockResolvedValueOnce(user);
			const service = createService(mockRepo);
			await service.updateUser("user-1", { email: "new@example.com" }, "actor-2");
			const patch = vi.mocked(mockRepo.update).mock.calls[0]?.[1];
			expect(patch?.emailVerifiedAt).toBeUndefined();
		});

		it("hashes the password when updating it", async () => {
			const user = makeUserRecord();
			vi.mocked(mockRepo.getById)
				.mockResolvedValueOnce(user)
				.mockResolvedValueOnce(user);
			const service = createService(mockRepo);
			await service.updateUser("user-1", { password: "new-password" }, "actor-1");
			expect(mockRepo.update).toHaveBeenCalledWith(
				"user-1",
				expect.objectContaining({ passwordHash: "hashed-password" })
			);
		});

		it("invalidates pending password-reset challenges when the password changes", async () => {
			const user = makeUserRecord();
			vi.mocked(mockRepo.getById).mockResolvedValueOnce(user).mockResolvedValueOnce(user);
			const challengeRepo = createChallengeRepoMock();
			const service = new UserService({
				userRepository: mockRepo,
				adminAuditLogService: createAuditLogService(),
				avatarCdnBaseUrl: "https://cdn.example.com",
				argonHasher: { fetch: vi.fn() } as unknown as Fetcher,
				hashMethod: "argon",
				userChallengeRepository: challengeRepo,
			});

			await service.updateUser("user-1", { password: "new-password" }, "actor-1");

			expect(challengeRepo.deleteByUserIdAndKind).toHaveBeenCalledWith("user-1", "password_reset");
		});

		it("does not touch reset challenges when the update has no password", async () => {
			const user = makeUserRecord();
			vi.mocked(mockRepo.getById).mockResolvedValueOnce(user).mockResolvedValueOnce(user);
			const challengeRepo = createChallengeRepoMock();
			const service = new UserService({
				userRepository: mockRepo,
				adminAuditLogService: createAuditLogService(),
				avatarCdnBaseUrl: "https://cdn.example.com",
				argonHasher: { fetch: vi.fn() } as unknown as Fetcher,
				hashMethod: "argon",
				userChallengeRepository: challengeRepo,
			});

			await service.updateUser("user-1", { name: "Alice B" }, "actor-1");

			expect(challengeRepo.deleteByUserIdAndKind).not.toHaveBeenCalled();
		});

		it("stamps passwordUpdatedAt when the password changes", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-04-07T12:00:00.000Z"));
			const user = makeUserRecord();
			vi.mocked(mockRepo.getById)
				.mockResolvedValueOnce(user)
				.mockResolvedValueOnce(user);
			const service = createService(mockRepo);
			await service.updateUser("user-1", { password: "new-password" }, "actor-1");
			expect(mockRepo.update).toHaveBeenCalledWith(
				"user-1",
				expect.objectContaining({ passwordUpdatedAt: "2026-04-07T12:00:00.000Z" })
			);
			vi.useRealTimers();
		});

		it("does not stamp passwordUpdatedAt when the password is unchanged", async () => {
			const user = makeUserRecord();
			vi.mocked(mockRepo.getById)
				.mockResolvedValueOnce(user)
				.mockResolvedValueOnce({ ...user, name: "Alice B" });
			const service = createService(mockRepo);
			await service.updateUser("user-1", { name: "Alice B" }, "actor-1");
			const patch = vi.mocked(mockRepo.update).mock.calls[0]?.[1];
			expect(patch?.passwordUpdatedAt).toBeUndefined();
		});

		it("replaces environment grants and audits them when environmentIds is provided", async () => {
			const user = makeUserRecord();
			vi.mocked(mockRepo.getById)
				.mockResolvedValueOnce(user)
				.mockResolvedValueOnce(user);
			const insert = vi.fn();
			const service = createService(mockRepo, createAuditLogService(insert));
			await service.updateUser("user-1", { environmentIds: ["env-1", "env-2"] }, "actor-1");
			expect(mockRepo.setUserEnvironments).toHaveBeenCalledWith("user-1", ["env-1", "env-2"]);
			const details = JSON.parse(vi.mocked(insert).mock.calls[0]?.[0]?.details ?? "{}");
			expect(details.changedFields).toContain("environments");
			expect(details.environmentIds).toEqual(["env-1", "env-2"]);
		});

		it("does not touch environment grants when environmentIds is omitted", async () => {
			const user = makeUserRecord();
			vi.mocked(mockRepo.getById)
				.mockResolvedValueOnce(user)
				.mockResolvedValueOnce({ ...user, name: "Alice B" });
			const service = createService(mockRepo);
			await service.updateUser("user-1", { name: "Alice B" }, "actor-1");
			expect(mockRepo.setUserEnvironments).not.toHaveBeenCalled();
		});

		it("can clear all environment grants with an empty array", async () => {
			const user = makeUserRecord();
			vi.mocked(mockRepo.getById)
				.mockResolvedValueOnce(user)
				.mockResolvedValueOnce(user);
			const service = createService(mockRepo);
			await service.updateUser("user-1", { environmentIds: [] }, "actor-1");
			expect(mockRepo.setUserEnvironments).toHaveBeenCalledWith("user-1", []);
		});

		it("writes a user.update audit log entry listing changed fields", async () => {
			const user = makeUserRecord();
			vi.mocked(mockRepo.getById)
				.mockResolvedValueOnce(user)
				.mockResolvedValueOnce({ ...user, name: "Alice B" });
			const insert = vi.fn();
			const service = createService(mockRepo, createAuditLogService(insert));
			await service.updateUser("user-1", { name: "Alice B", email: "new@example.com" }, "actor-1");
			expect(insert).toHaveBeenCalledWith(
				expect.objectContaining({
					action: "user.update",
					resource_type: "user",
					resource_id: "user-1",
					actor_user_id: "actor-1",
				})
			);
			const details = JSON.parse(vi.mocked(insert).mock.calls[0]?.[0]?.details ?? "{}");
			expect(details.changedFields).toEqual(expect.arrayContaining(["name", "email"]));
			expect(details.changedFields).not.toContain("password");
		});

		it("writes a user.password_change audit entry when only the password changes", async () => {
			const user = makeUserRecord();
			vi.mocked(mockRepo.getById)
				.mockResolvedValueOnce(user)
				.mockResolvedValueOnce(user);
			const insert = vi.fn();
			const service = createService(mockRepo, createAuditLogService(insert));
			// Self-service password change: actor and target are the same user.
			await service.updateUser("user-1", { password: "new-password" }, "user-1");
			expect(insert).toHaveBeenCalledWith(
				expect.objectContaining({
					action: "user.password_change",
					resource_id: "user-1",
					actor_user_id: "user-1",
				})
			);
			const details = JSON.parse(vi.mocked(insert).mock.calls[0]?.[0]?.details ?? "{}");
			expect(details.changedFields).toEqual(["password"]);
		});

		it("writes a distinct user.admin_grant audit entry when granting admin", async () => {
			const user = makeUserRecord({ id: "user-1", isAdmin: false });
			vi.mocked(mockRepo.getById)
				.mockResolvedValueOnce(user)
				.mockResolvedValueOnce({ ...user, isAdmin: true });
			const insert = vi.fn();
			const service = createService(mockRepo, createAuditLogService(insert));
			await service.updateUser("user-1", { isAdmin: true }, "actor-2");

			// Generic user.update first, then the privilege-specific entry.
			expect(insert).toHaveBeenCalledTimes(2);
			expect(insert.mock.calls[1]?.[0]).toEqual(
				expect.objectContaining({
					action: "user.admin_grant",
					resource_type: "user",
					resource_id: "user-1",
					actor_user_id: "actor-2",
				})
			);
			const details = JSON.parse(insert.mock.calls[1]?.[0]?.details ?? "{}");
			expect(details).toMatchObject({ from: false, to: true });
		});

		it("writes a distinct user.admin_revoke audit entry when removing admin", async () => {
			const user = makeUserRecord({ id: "user-1", isAdmin: true });
			vi.mocked(mockRepo.getById)
				.mockResolvedValueOnce(user)
				.mockResolvedValueOnce({ ...user, isAdmin: false });
			vi.mocked(mockRepo.list).mockResolvedValue([
				makeUserRecord({ id: "user-1", isAdmin: true }),
				makeUserRecord({ id: "user-2", isAdmin: true }),
			]);
			const insert = vi.fn();
			const service = createService(mockRepo, createAuditLogService(insert));
			await service.updateUser("user-1", { isAdmin: false }, "actor-2");

			expect(insert).toHaveBeenCalledTimes(2);
			expect(insert.mock.calls[1]?.[0]).toEqual(
				expect.objectContaining({ action: "user.admin_revoke", resource_id: "user-1" })
			);
			const details = JSON.parse(insert.mock.calls[1]?.[0]?.details ?? "{}");
			expect(details).toMatchObject({ from: true, to: false });
		});

		it("does not write an audit entry when nothing changes", async () => {
			const user = makeUserRecord();
			vi.mocked(mockRepo.getById)
				.mockResolvedValueOnce(user)
				.mockResolvedValueOnce(user);
			const insert = vi.fn();
			const service = createService(mockRepo, createAuditLogService(insert));
			await service.updateUser("user-1", {}, "actor-1");
			expect(insert).not.toHaveBeenCalled();
		});

		it("does not hash a blank password string", async () => {
			const user = makeUserRecord();
			vi.mocked(mockRepo.getById)
				.mockResolvedValueOnce(user)
				.mockResolvedValueOnce(user);
			const service = createService(mockRepo);
			await service.updateUser("user-1", { password: "   " }, "actor-1");
			const patch = vi.mocked(mockRepo.update).mock.calls[0]?.[1];
			expect(patch?.passwordHash).toBeUndefined();
		});

		it("throws when the user is not found after update", async () => {
			vi.mocked(mockRepo.getById)
				.mockResolvedValueOnce(makeUserRecord())
				.mockResolvedValueOnce(null);
			const service = createService(mockRepo);
			await expect(service.updateUser("user-1", { name: "New Name" }, "actor-1")).rejects.toThrow(
				"User not found"
			);
		});
	});

	describe("deleteUser", () => {
		it("throws when the actor tries to delete themselves", async () => {
			const service = createService(mockRepo);
			await expect(service.deleteUser("actor-1", "actor-1")).rejects.toThrow(
				"You cannot delete your own user"
			);
		});

		it("throws when the target user is not found", async () => {
			vi.mocked(mockRepo.getById).mockResolvedValue(null);
			const service = createService(mockRepo);
			await expect(service.deleteUser("user-1", "actor-2")).rejects.toThrow("User not found");
		});

		it("throws when deleting the last admin", async () => {
			vi.mocked(mockRepo.getById).mockResolvedValue(makeUserRecord({ id: "user-1", isAdmin: true }));
			vi.mocked(mockRepo.list).mockResolvedValue([makeUserRecord({ id: "user-1", isAdmin: true })]);
			const service = createService(mockRepo);
			await expect(service.deleteUser("user-1", "actor-2")).rejects.toThrow(
				"Cannot delete the last admin"
			);
		});

		it("deletes a non-admin user without checking admin count", async () => {
			vi.mocked(mockRepo.getById).mockResolvedValue(makeUserRecord({ isAdmin: false }));
			const service = createService(mockRepo);
			await service.deleteUser("user-1", "actor-2");
			expect(mockRepo.deleteWithAudit).toHaveBeenCalledWith(
				"user-1",
				expect.objectContaining({
					action: "user.delete",
					resource_type: "user",
					resource_id: "user-1",
					actor_user_id: "actor-2",
				})
			);
			expect(mockRepo.list).not.toHaveBeenCalled();
		});

		it("deletes an admin when another admin exists", async () => {
			vi.mocked(mockRepo.getById).mockResolvedValue(makeUserRecord({ id: "user-1", isAdmin: true }));
			vi.mocked(mockRepo.list).mockResolvedValue([
				makeUserRecord({ id: "user-1", isAdmin: true }),
				makeUserRecord({ id: "user-2", isAdmin: true }),
			]);
			const service = createService(mockRepo);
			await service.deleteUser("user-1", "actor-2");
			expect(mockRepo.deleteWithAudit).toHaveBeenCalledWith(
				"user-1",
				expect.objectContaining({ action: "user.delete", resource_id: "user-1" })
			);
		});
	});
});
