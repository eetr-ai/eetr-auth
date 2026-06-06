import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
	CreatePasswordPolicyInput,
	PasswordPolicy,
	PasswordPolicyRepository,
} from "@/lib/repositories/password-policy.repository";
import type { AdminAuditLogRepository } from "@/lib/repositories/admin-audit-log.repository";
import { PasswordPolicyService } from "@/lib/services/password-policy.service";
import { AdminAuditLogService } from "@/lib/services/admin-audit-log.service";

function createPolicyRepoMock(): PasswordPolicyRepository {
	return {
		list: vi.fn(),
		listWithEnvironments: vi.fn(),
		getById: vi.fn(),
		getWithEnvironments: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
		setEnvironments: vi.fn(),
		getPolicyForEnvironment: vi.fn().mockResolvedValue(null),
		getAdminPolicy: vi.fn().mockResolvedValue(null),
		getStrictestEnabledMaxAgeDaysForUser: vi.fn(),
		getEnabledPoliciesForUser: vi.fn().mockResolvedValue([]),
	};
}

function createAuditLogService(insert = vi.fn()): AdminAuditLogService {
	const logRepo: AdminAuditLogRepository = { insert, listLogs: vi.fn() };
	return new AdminAuditLogService({ logRepo });
}

function createService(
	policyRepo: PasswordPolicyRepository,
	adminAuditLogService: AdminAuditLogService = createAuditLogService()
): PasswordPolicyService {
	return new PasswordPolicyService({ policyRepo, adminAuditLogService });
}

function makeInput(overrides?: Partial<CreatePasswordPolicyInput>): CreatePasswordPolicyInput {
	return {
		name: "Default",
		enabled: true,
		minLength: 8,
		maxLength: null,
		minUppercase: 0,
		minLowercase: 0,
		minNumber: 0,
		minSpecial: 0,
		rejectContainsIdentifier: false,
		maxPasswordAgeDays: 0,
		...overrides,
	};
}

function makePolicy(overrides?: Partial<PasswordPolicy>): PasswordPolicy {
	return {
		id: "policy-1",
		name: "Default",
		enabled: true,
		minLength: 8,
		maxLength: null,
		minUppercase: 0,
		minLowercase: 0,
		minNumber: 0,
		minSpecial: 0,
		rejectContainsIdentifier: false,
		maxPasswordAgeDays: 0,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

describe("PasswordPolicyService", () => {
	let mockRepo: PasswordPolicyRepository;

	beforeEach(() => {
		mockRepo = createPolicyRepoMock();
		vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("new-policy-id");
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("create", () => {
		it("creates a policy, assigns environments, and writes an audit entry", async () => {
			vi.mocked(mockRepo.getWithEnvironments).mockResolvedValue({
				...makePolicy({ id: "new-policy-id" }),
				environmentIds: ["env-1"],
			});
			const insert = vi.fn();
			const service = createService(mockRepo, createAuditLogService(insert));

			const result = await service.create(makeInput(), ["env-1"], "actor-1");

			expect(result.ok).toBe(true);
			expect(mockRepo.create).toHaveBeenCalledWith(
				"new-policy-id",
				expect.objectContaining({ name: "Default" }),
				expect.any(String)
			);
			expect(mockRepo.setEnvironments).toHaveBeenCalledWith("new-policy-id", ["env-1"]);
			expect(insert).toHaveBeenCalledWith(
				expect.objectContaining({
					action: "password_policy.create",
					resource_type: "password_policy",
					resource_id: "new-policy-id",
					actor_user_id: "actor-1",
				})
			);
		});

		it("trims the policy name before persisting", async () => {
			const service = createService(mockRepo);
			await service.create(makeInput({ name: "  Strict  " }), []);
			expect(mockRepo.create).toHaveBeenCalledWith(
				"new-policy-id",
				expect.objectContaining({ name: "Strict" }),
				expect.any(String)
			);
		});

		it("rejects an empty name without creating", async () => {
			const service = createService(mockRepo);
			const result = await service.create(makeInput({ name: "   " }), []);
			expect(result.ok).toBe(false);
			expect(result.error).toMatch(/name is required/i);
			expect(mockRepo.create).not.toHaveBeenCalled();
		});

		it("rejects maxLength below minLength", async () => {
			const service = createService(mockRepo);
			const result = await service.create(makeInput({ minLength: 12, maxLength: 8 }), []);
			expect(result.ok).toBe(false);
			expect(result.error).toMatch(/maximum length cannot be less/i);
			expect(mockRepo.create).not.toHaveBeenCalled();
		});

		it("rejects a negative max password age", async () => {
			const service = createService(mockRepo);
			const result = await service.create(makeInput({ maxPasswordAgeDays: -1 }), []);
			expect(result.ok).toBe(false);
			expect(mockRepo.create).not.toHaveBeenCalled();
		});

		it("rejects a negative minimum character count", async () => {
			const service = createService(mockRepo);
			const result = await service.create(makeInput({ minSpecial: -1 }), []);
			expect(result.ok).toBe(false);
			expect(result.error).toMatch(/special characters must be a whole number/i);
			expect(mockRepo.create).not.toHaveBeenCalled();
		});

		it("accepts a minimum character count greater than one", async () => {
			const service = createService(mockRepo);
			const result = await service.create(makeInput({ minUppercase: 2, minSpecial: 3 }), []);
			expect(result.ok).toBe(true);
			expect(mockRepo.create).toHaveBeenCalledWith(
				"new-policy-id",
				expect.objectContaining({ minUppercase: 2, minSpecial: 3 }),
				expect.any(String)
			);
		});

		it("rejects assignment of an environment already owned by another policy", async () => {
			vi.mocked(mockRepo.getPolicyForEnvironment).mockResolvedValue(
				makePolicy({ id: "other", name: "Existing" })
			);
			const service = createService(mockRepo);
			const result = await service.create(makeInput(), ["env-1"]);
			expect(result.ok).toBe(false);
			expect(result.error).toMatch(/already assigned to policy "Existing"/);
			expect(mockRepo.create).not.toHaveBeenCalled();
		});
	});

	describe("update", () => {
		it("returns an error when the policy does not exist", async () => {
			vi.mocked(mockRepo.getById).mockResolvedValue(null);
			const service = createService(mockRepo);
			const result = await service.update("missing", { name: "X" }, undefined);
			expect(result.ok).toBe(false);
			expect(result.error).toMatch(/not found/i);
		});

		it("validates cross-field rules against the merged record", async () => {
			// Existing minLength 10; updating only maxLength to 6 must fail.
			vi.mocked(mockRepo.getById).mockResolvedValue(makePolicy({ minLength: 10 }));
			const service = createService(mockRepo);
			const result = await service.update("policy-1", { maxLength: 6 }, undefined);
			expect(result.ok).toBe(false);
			expect(result.error).toMatch(/maximum length cannot be less/i);
			expect(mockRepo.update).not.toHaveBeenCalled();
		});

		it("updates and re-assigns environments, ignoring the policy's own env in the conflict check", async () => {
			vi.mocked(mockRepo.getById).mockResolvedValue(makePolicy());
			// Env already owned by THIS policy -> not a conflict.
			vi.mocked(mockRepo.getPolicyForEnvironment).mockResolvedValue(makePolicy());
			vi.mocked(mockRepo.getWithEnvironments).mockResolvedValue({
				...makePolicy(),
				environmentIds: ["env-1"],
			});
			const insert = vi.fn();
			const service = createService(mockRepo, createAuditLogService(insert));

			const result = await service.update("policy-1", { enabled: false }, ["env-1"], "actor-1");

			expect(result.ok).toBe(true);
			expect(mockRepo.update).toHaveBeenCalledWith(
				"policy-1",
				expect.objectContaining({ enabled: false }),
				expect.any(String)
			);
			expect(mockRepo.setEnvironments).toHaveBeenCalledWith("policy-1", ["env-1"]);
			expect(insert).toHaveBeenCalledWith(
				expect.objectContaining({ action: "password_policy.update", resource_id: "policy-1" })
			);
		});
	});

	describe("delete", () => {
		it("deletes an existing policy and writes an audit entry", async () => {
			vi.mocked(mockRepo.getById).mockResolvedValue(makePolicy({ name: "Strict" }));
			const insert = vi.fn();
			const service = createService(mockRepo, createAuditLogService(insert));

			const result = await service.delete("policy-1", "actor-1");

			expect(result.ok).toBe(true);
			expect(mockRepo.delete).toHaveBeenCalledWith("policy-1");
			expect(insert).toHaveBeenCalledWith(
				expect.objectContaining({
					action: "password_policy.delete",
					resource_id: "policy-1",
					actor_user_id: "actor-1",
				})
			);
		});

		it("returns an error when the policy does not exist", async () => {
			vi.mocked(mockRepo.getById).mockResolvedValue(null);
			const service = createService(mockRepo);
			const result = await service.delete("missing");
			expect(result.ok).toBe(false);
			expect(mockRepo.delete).not.toHaveBeenCalled();
		});
	});

	describe("getMaxPasswordAgeDaysForUser", () => {
		it("delegates to the repository", async () => {
			vi.mocked(mockRepo.getStrictestEnabledMaxAgeDaysForUser).mockResolvedValue(30);
			const service = createService(mockRepo);
			await expect(service.getMaxPasswordAgeDaysForUser("user-1")).resolves.toBe(30);
			expect(mockRepo.getStrictestEnabledMaxAgeDaysForUser).toHaveBeenCalledWith("user-1");
		});
	});

	describe("isPasswordExpiredForUser", () => {
		const NOW = "2026-06-01T00:00:00.000Z";

		beforeEach(() => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date(NOW));
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it("is never expired when passwordUpdatedAt is null (pre-feature user)", async () => {
			vi.mocked(mockRepo.getStrictestEnabledMaxAgeDaysForUser).mockResolvedValue(30);
			const service = createService(mockRepo);
			await expect(service.isPasswordExpiredForUser("user-1", null)).resolves.toBe(false);
		});

		it("is never expired when no policy enforces a max age", async () => {
			vi.mocked(mockRepo.getStrictestEnabledMaxAgeDaysForUser).mockResolvedValue(null);
			const service = createService(mockRepo);
			const tenYearsAgo = "2016-01-01T00:00:00.000Z";
			await expect(service.isPasswordExpiredForUser("user-1", tenYearsAgo)).resolves.toBe(false);
		});

		it("is not expired when the password is within the max age", async () => {
			vi.mocked(mockRepo.getStrictestEnabledMaxAgeDaysForUser).mockResolvedValue(30);
			const service = createService(mockRepo);
			const tenDaysAgo = "2026-05-22T00:00:00.000Z";
			await expect(service.isPasswordExpiredForUser("user-1", tenDaysAgo)).resolves.toBe(false);
		});

		it("is expired when the password is older than the max age", async () => {
			vi.mocked(mockRepo.getStrictestEnabledMaxAgeDaysForUser).mockResolvedValue(30);
			const service = createService(mockRepo);
			const sixtyDaysAgo = "2026-04-02T00:00:00.000Z";
			await expect(service.isPasswordExpiredForUser("user-1", sixtyDaysAgo)).resolves.toBe(true);
		});

		describe("admin path (max age)", () => {
			const sixtyDaysAgo = "2026-04-02T00:00:00.000Z";

			it("uses the admin policy (not the user's environments) when isAdmin is true", async () => {
				// Environment lookup would say "not expired", but the admin policy expires it.
				vi.mocked(mockRepo.getStrictestEnabledMaxAgeDaysForUser).mockResolvedValue(null);
				vi.mocked(mockRepo.getAdminPolicy).mockResolvedValue(
					makePolicy({ enabled: true, maxPasswordAgeDays: 30 })
				);
				const service = createService(mockRepo);
				await expect(service.isPasswordExpiredForUser("admin-1", sixtyDaysAgo, true)).resolves.toBe(true);
				expect(mockRepo.getStrictestEnabledMaxAgeDaysForUser).not.toHaveBeenCalled();
			});

			it("never expires an admin when no admin policy is selected", async () => {
				vi.mocked(mockRepo.getAdminPolicy).mockResolvedValue(null);
				const service = createService(mockRepo);
				await expect(service.isPasswordExpiredForUser("admin-1", sixtyDaysAgo, true)).resolves.toBe(false);
			});

			it("ignores a disabled admin policy or one with no expiry", async () => {
				const service = createService(mockRepo);
				vi.mocked(mockRepo.getAdminPolicy).mockResolvedValue(
					makePolicy({ enabled: false, maxPasswordAgeDays: 30 })
				);
				await expect(service.isPasswordExpiredForUser("admin-1", sixtyDaysAgo, true)).resolves.toBe(false);
				vi.mocked(mockRepo.getAdminPolicy).mockResolvedValue(
					makePolicy({ enabled: true, maxPasswordAgeDays: 0 })
				);
				await expect(service.isPasswordExpiredForUser("admin-1", sixtyDaysAgo, true)).resolves.toBe(false);
			});
		});
	});

	describe("validateAdminPassword", () => {
		it("passes when no admin policy is selected", async () => {
			vi.mocked(mockRepo.getAdminPolicy).mockResolvedValue(null);
			const service = createService(mockRepo);
			const result = await service.validateAdminPassword("anything");
			expect(result.ok).toBe(true);
			expect(result.violations).toEqual([]);
		});

		it("passes when the admin policy is disabled", async () => {
			vi.mocked(mockRepo.getAdminPolicy).mockResolvedValue(
				makePolicy({ enabled: false, minLength: 100, minSpecial: 5 })
			);
			const service = createService(mockRepo);
			await expect(service.validateAdminPassword("short")).resolves.toMatchObject({ ok: true });
		});

		it("reports violations against an active admin policy", async () => {
			vi.mocked(mockRepo.getAdminPolicy).mockResolvedValue(
				makePolicy({ enabled: true, minLength: 8, minUppercase: 1, minSpecial: 2 })
			);
			const service = createService(mockRepo);
			const result = await service.validateAdminPassword("abc");
			expect(result.ok).toBe(false);
			expect(result.violations.map((v) => v.code)).toEqual(
				expect.arrayContaining(["too_short", "too_few_uppercase", "too_few_special"])
			);
		});

		it("applies the contains-identifier rule using the provided identifiers", async () => {
			vi.mocked(mockRepo.getAdminPolicy).mockResolvedValue(
				makePolicy({ enabled: true, minLength: 1, rejectContainsIdentifier: true })
			);
			const service = createService(mockRepo);
			const result = await service.validateAdminPassword("xxadminxx", { username: "admin" });
			expect(result.violations.map((v) => v.code)).toContain("contains_identifier");
		});
	});

	describe("getApplicablePolicyForSignIn", () => {
		it("uses the admin policy for admins (ignoring environment)", async () => {
			vi.mocked(mockRepo.getAdminPolicy).mockResolvedValue(makePolicy({ id: "admin-pol" }));
			const service = createService(mockRepo);
			const policy = await service.getApplicablePolicyForSignIn({
				userId: "admin-1",
				isAdmin: true,
				environmentId: "env-1",
			});
			expect(policy?.id).toBe("admin-pol");
			expect(mockRepo.getPolicyForEnvironment).not.toHaveBeenCalled();
		});

		it("uses the client's environment policy when an environmentId is given", async () => {
			vi.mocked(mockRepo.getPolicyForEnvironment).mockResolvedValue(makePolicy({ id: "env-pol" }));
			const service = createService(mockRepo);
			const policy = await service.getApplicablePolicyForSignIn({
				userId: "u1",
				isAdmin: false,
				environmentId: "env-1",
			});
			expect(policy?.id).toBe("env-pol");
			expect(mockRepo.getPolicyForEnvironment).toHaveBeenCalledWith("env-1");
		});

		it("falls back to the user's first enabled environment policy when no client is in context", async () => {
			vi.mocked(mockRepo.getEnabledPoliciesForUser).mockResolvedValue([makePolicy({ id: "fallback-pol" })]);
			const service = createService(mockRepo);
			const policy = await service.getApplicablePolicyForSignIn({ userId: "u1", isAdmin: false });
			expect(policy?.id).toBe("fallback-pol");
			expect(mockRepo.getEnabledPoliciesForUser).toHaveBeenCalledWith("u1");
		});

		it("treats a disabled policy as no policy", async () => {
			vi.mocked(mockRepo.getPolicyForEnvironment).mockResolvedValue(makePolicy({ enabled: false }));
			const service = createService(mockRepo);
			const policy = await service.getApplicablePolicyForSignIn({
				userId: "u1",
				isAdmin: false,
				environmentId: "env-1",
			});
			expect(policy).toBeNull();
		});
	});

	describe("checkSignInPasswordComplexity", () => {
		it("passes with a null policy when none applies", async () => {
			const service = createService(mockRepo);
			const result = await service.checkSignInPasswordComplexity({
				userId: "u1",
				isAdmin: false,
				environmentId: "env-1",
				password: "anything",
			});
			expect(result).toEqual({ ok: true, violations: [], policy: null });
		});

		it("reports violations against the client's environment policy", async () => {
			vi.mocked(mockRepo.getPolicyForEnvironment).mockResolvedValue(
				makePolicy({ enabled: true, minLength: 8, minUppercase: 1 })
			);
			const service = createService(mockRepo);
			const result = await service.checkSignInPasswordComplexity({
				userId: "u1",
				isAdmin: false,
				environmentId: "env-1",
				password: "abc",
				identifiers: { username: "u1", email: null },
			});
			expect(result.ok).toBe(false);
			expect(result.policy?.id).toBe("policy-1");
			expect(result.violations.map((v) => v.code)).toEqual(
				expect.arrayContaining(["too_short", "too_few_uppercase"])
			);
		});

		it("gates a no-client non-admin against every enabled environment policy, returning the first that fails", async () => {
			vi.mocked(mockRepo.getEnabledPoliciesForUser).mockResolvedValue([
				makePolicy({ id: "lax", minLength: 1 }),
				makePolicy({ id: "strict", minLength: 20 }),
			]);
			const service = createService(mockRepo);
			const result = await service.checkSignInPasswordComplexity({
				userId: "u1",
				isAdmin: false,
				password: "abcdefgh",
			});
			expect(result.ok).toBe(false);
			expect(result.policy?.id).toBe("strict");
		});
	});
});
