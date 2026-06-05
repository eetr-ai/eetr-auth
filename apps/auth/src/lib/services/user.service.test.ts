import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { UserRecord, UserRepository } from "@/lib/repositories/admin.repository";
import type { AdminAuditLogRepository } from "@/lib/repositories/admin-audit-log.repository";
import { UserService } from "@/lib/services/user.service";
import { AdminAuditLogService } from "@/lib/services/admin-audit-log.service";

vi.mock("@/lib/auth/password-hash", () => ({
	hashPassword: vi.fn().mockResolvedValue("hashed-password"),
}));

vi.mock("@/lib/users/profile", () => ({
	normalizeOptionalProfileField: vi.fn().mockImplementation((v: string | null | undefined) => {
		if (v == null) return null;
		const t = v.trim();
		return t.length > 0 ? t : null;
	}),
}));

function createUserRepoMock(): UserRepository {
	return {
		create: vi.fn(),
		list: vi.fn(),
		findByUsername: vi.fn(),
		findByEmail: vi.fn(),
		getById: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
		deleteWithAudit: vi.fn(),
	};
}

function createAuditLogService(insert = vi.fn()): AdminAuditLogService {
	const logRepo: AdminAuditLogRepository = {
		insert,
		listLogs: vi.fn(),
	};
	return new AdminAuditLogService({ logRepo });
}

function createService(
	userRepository: UserRepository,
	adminAuditLogService: AdminAuditLogService = createAuditLogService()
): UserService {
	return new UserService({
		userRepository,
		adminAuditLogService,
		avatarCdnBaseUrl: "https://cdn.example.com",
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
				true
			);
			expect(result.emailVerifiedAt).toBe("2026-04-07T12:00:00.000Z");
			expect(result.isAdmin).toBe(true);
			vi.useRealTimers();
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
