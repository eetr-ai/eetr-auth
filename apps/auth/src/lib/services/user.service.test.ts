import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { UserRecord, UserRepository } from "@/lib/repositories/admin.repository";
import { UserService } from "@/lib/services/user.service";

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
	};
}

function createService(userRepository: UserRepository): UserService {
	return new UserService({
		userRepository,
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
			expect(mockRepo.delete).toHaveBeenCalledWith("user-1");
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
			expect(mockRepo.delete).toHaveBeenCalledWith("user-1");
		});
	});
});
