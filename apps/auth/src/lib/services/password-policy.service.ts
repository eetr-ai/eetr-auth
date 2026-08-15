import type {
	CreatePasswordPolicyInput,
	PasswordPolicy,
	PasswordPolicyRepository,
	PasswordPolicyWithEnvironments,
	UpdatePasswordPolicyInput,
} from "@/lib/repositories/password-policy.repository";
import {
	validatePasswordAgainstPolicy,
	type PasswordIdentifiers,
	type PasswordPolicyCheckResult,
	type PasswordPolicyViolation,
} from "@/lib/auth/password-policy-validation";
import type { AdminAuditLogService } from "./admin-audit-log.service";
import { AUDIT_ACTION, AUDIT_RESOURCE } from "./audit-actions";

export interface PasswordPolicyServiceDependencies {
	policyRepo: PasswordPolicyRepository;
	adminAuditLogService: AdminAuditLogService;
}

export interface PasswordPolicyResult {
	ok: boolean;
	error?: string;
	policy?: PasswordPolicyWithEnvironments;
}

/**
 * Validates the rule fields shared by create/update. Returns an error message for the
 * first problem found, or null when the (possibly partial) input is valid.
 */
function validateRules(input: {
	name?: string;
	minLength?: number;
	maxLength?: number | null;
	minUppercase?: number;
	minLowercase?: number;
	minNumber?: number;
	minSpecial?: number;
	maxPasswordAgeDays?: number;
}): string | null {
	if (input.name !== undefined && input.name.trim().length === 0) {
		return "Policy name is required";
	}
	if (input.minLength !== undefined && (!Number.isInteger(input.minLength) || input.minLength < 1)) {
		return "Minimum length must be a whole number of at least 1";
	}
	const counts: Array<[number | undefined, string]> = [
		[input.minUppercase, "Minimum uppercase"],
		[input.minLowercase, "Minimum lowercase"],
		[input.minNumber, "Minimum numbers"],
		[input.minSpecial, "Minimum special characters"],
	];
	for (const [value, label] of counts) {
		if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
			return `${label} must be a whole number of 0 or more`;
		}
	}
	if (input.maxLength !== undefined && input.maxLength !== null) {
		if (!Number.isInteger(input.maxLength) || input.maxLength < 1) {
			return "Maximum length must be a whole number of at least 1";
		}
		if (input.minLength !== undefined && input.maxLength < input.minLength) {
			return "Maximum length cannot be less than minimum length";
		}
	}
	if (
		input.maxPasswordAgeDays !== undefined &&
		(!Number.isInteger(input.maxPasswordAgeDays) || input.maxPasswordAgeDays < 0)
	) {
		return "Max password age must be a whole number of days (0 = no expiry)";
	}
	return null;
}

function duplicateNameError(name: string): string {
	return `A policy named "${name}" already exists`;
}

/**
 * True for the driver error raised when `password_policies.name` collides.
 *
 * The pre-check in `findNameConflict` is a check-then-act and cannot close the
 * race on its own, so the write paths translate the constraint error too rather
 * than letting a raw `D1_ERROR: UNIQUE constraint failed…` reach the user.
 */
function isDuplicateNameViolation(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /UNIQUE constraint failed:\s*password_policies\.name/i.test(message);
}

export class PasswordPolicyService {
	private readonly policyRepo: PasswordPolicyRepository;
	private readonly adminAuditLogService: AdminAuditLogService;

	constructor({ policyRepo, adminAuditLogService }: PasswordPolicyServiceDependencies) {
		this.policyRepo = policyRepo;
		this.adminAuditLogService = adminAuditLogService;
	}

	async list(): Promise<PasswordPolicyWithEnvironments[]> {
		return this.policyRepo.listWithEnvironments();
	}

	async getById(id: string): Promise<PasswordPolicyWithEnvironments | null> {
		return this.policyRepo.getWithEnvironments(id);
	}

	/**
	 * Returns an error message if any of the requested environments is already assigned
	 * to a different policy (each environment may hold at most one policy), else null.
	 */
	private async findEnvironmentConflict(
		environmentIds: string[],
		policyId: string | null
	): Promise<string | null> {
		for (const environmentId of environmentIds) {
			const owner = await this.policyRepo.getPolicyForEnvironment(environmentId);
			if (owner && owner.id !== policyId) {
				return `Environment is already assigned to policy "${owner.name}"`;
			}
		}
		return null;
	}

	/**
	 * Returns an error message if another policy already uses `name`, else null.
	 *
	 * The name column is UNIQUE, so without this the driver's raw constraint
	 * error is what reaches the user. Matched exactly against the trimmed name
	 * that would be stored, so this rejects precisely what the database would.
	 *
	 * This is a check-then-act, so it cannot be the only defence — a concurrent
	 * write can still land between the read and the insert. The write paths also
	 * translate the constraint error itself; see `duplicateNameError`.
	 */
	private async findNameConflict(name: string, policyId: string | null): Promise<string | null> {
		const trimmed = name.trim();
		const existing = await this.policyRepo.list();
		const clash = existing.find((policy) => policy.id !== policyId && policy.name === trimmed);
		return clash ? duplicateNameError(trimmed) : null;
	}

	async create(
		input: CreatePasswordPolicyInput,
		environmentIds: string[],
		actorUserId: string | null = null
	): Promise<PasswordPolicyResult> {
		const ruleError = validateRules(input);
		if (ruleError) {
			return { ok: false, error: ruleError };
		}
		const nameConflict = await this.findNameConflict(input.name, null);
		if (nameConflict) {
			return { ok: false, error: nameConflict };
		}
		const conflict = await this.findEnvironmentConflict(environmentIds, null);
		if (conflict) {
			return { ok: false, error: conflict };
		}

		const id = crypto.randomUUID();
		const now = new Date().toISOString();
		const trimmedName = input.name.trim();
		try {
			await this.policyRepo.create(id, { ...input, name: trimmedName }, now);
		} catch (error) {
			if (isDuplicateNameViolation(error)) {
				return { ok: false, error: duplicateNameError(trimmedName) };
			}
			throw error;
		}
		if (environmentIds.length > 0) {
			await this.policyRepo.setEnvironments(id, environmentIds);
		}
		await this.adminAuditLogService.logAction({
			actorUserId,
			action: AUDIT_ACTION.passwordPolicyCreate,
			resourceType: AUDIT_RESOURCE.passwordPolicy,
			resourceId: id,
			details: { name: input.name.trim(), enabled: input.enabled, environmentIds },
		});
		const policy = await this.policyRepo.getWithEnvironments(id);
		return { ok: true, policy: policy ?? undefined };
	}

	async update(
		id: string,
		updates: UpdatePasswordPolicyInput,
		environmentIds: string[] | undefined,
		actorUserId: string | null = null
	): Promise<PasswordPolicyResult> {
		const existing = await this.policyRepo.getById(id);
		if (!existing) {
			return { ok: false, error: "Password policy not found" };
		}
		// Validate against the merged view so cross-field rules (max >= min) hold even
		// when only one of the two fields is being changed.
		const ruleError = validateRules({
			name: updates.name,
			minLength: updates.minLength ?? existing.minLength,
			maxLength: updates.maxLength !== undefined ? updates.maxLength : existing.maxLength,
			minUppercase: updates.minUppercase,
			minLowercase: updates.minLowercase,
			minNumber: updates.minNumber,
			minSpecial: updates.minSpecial,
			maxPasswordAgeDays: updates.maxPasswordAgeDays,
		});
		if (ruleError) {
			return { ok: false, error: ruleError };
		}
		if (updates.name !== undefined) {
			const nameConflict = await this.findNameConflict(updates.name, id);
			if (nameConflict) {
				return { ok: false, error: nameConflict };
			}
		}
		if (environmentIds !== undefined) {
			const conflict = await this.findEnvironmentConflict(environmentIds, id);
			if (conflict) {
				return { ok: false, error: conflict };
			}
		}

		const now = new Date().toISOString();
		const patch: UpdatePasswordPolicyInput = {
			...updates,
			...(updates.name !== undefined ? { name: updates.name.trim() } : {}),
		};
		try {
			await this.policyRepo.update(id, patch, now);
		} catch (error) {
			if (isDuplicateNameViolation(error)) {
				return { ok: false, error: duplicateNameError(patch.name ?? existing.name) };
			}
			throw error;
		}
		if (environmentIds !== undefined) {
			await this.policyRepo.setEnvironments(id, environmentIds);
		}
		await this.adminAuditLogService.logAction({
			actorUserId,
			action: AUDIT_ACTION.passwordPolicyUpdate,
			resourceType: AUDIT_RESOURCE.passwordPolicy,
			resourceId: id,
			details: { name: (patch.name ?? existing.name), environmentIds },
		});
		const policy = await this.policyRepo.getWithEnvironments(id);
		return { ok: true, policy: policy ?? undefined };
	}

	async delete(id: string, actorUserId: string | null = null): Promise<{ ok: boolean; error?: string }> {
		const existing = await this.policyRepo.getById(id);
		if (!existing) {
			return { ok: false, error: "Password policy not found" };
		}
		// Environment assignments cascade automatically via FK.
		await this.policyRepo.delete(id);
		await this.adminAuditLogService.logAction({
			actorUserId,
			action: AUDIT_ACTION.passwordPolicyDelete,
			resourceType: AUDIT_RESOURCE.passwordPolicy,
			resourceId: id,
			details: { name: existing.name },
		});
		return { ok: true };
	}

	/** Strictest enabled max password age (days) for a user, via their environments. */
	async getMaxPasswordAgeDaysForUser(userId: string): Promise<number | null> {
		return this.policyRepo.getStrictestEnabledMaxAgeDaysForUser(userId);
	}

	/** The policy selected as the admin sign-in policy, or null when none is set. */
	async getAdminPolicy(): Promise<PasswordPolicy | null> {
		return this.policyRepo.getAdminPolicy();
	}

	/**
	 * Validates a candidate password against the admin sign-in policy (complexity rules).
	 * Returns `ok: true` with no violations when no admin policy is selected or it is
	 * disabled — i.e. only an active policy is enforced. `identifiers` enables the optional
	 * "must not contain the username/email" rule.
	 */
	async validateAdminPassword(
		password: string,
		identifiers: PasswordIdentifiers = {}
	): Promise<PasswordPolicyCheckResult> {
		const policy = await this.policyRepo.getAdminPolicy();
		if (!policy) return { ok: true, violations: [] };
		return validatePasswordAgainstPolicy(policy, password, identifiers);
	}

	/**
	 * Max password age (days) from the admin sign-in policy, or null when no policy is
	 * selected, it is disabled, or it sets no expiry. Admins have no environment, so this
	 * is the admin counterpart of {@link getMaxPasswordAgeDaysForUser}.
	 */
	async getAdminMaxPasswordAgeDays(): Promise<number | null> {
		const policy = await this.policyRepo.getAdminPolicy();
		if (!policy || !policy.enabled || policy.maxPasswordAgeDays <= 0) return null;
		return policy.maxPasswordAgeDays;
	}

	/**
	 * Whether the user's password has exceeded the applicable max age. For admins the
	 * global admin policy is used (they have no environment); for everyone else the
	 * strictest enabled max age across their granted environments. A user with no recorded
	 * `passwordUpdatedAt` (pre-feature) or no applicable policy is never considered expired.
	 */
	async isPasswordExpiredForUser(
		userId: string,
		passwordUpdatedAt: string | null,
		isAdmin = false
	): Promise<boolean> {
		if (!passwordUpdatedAt) return false;
		const maxAgeDays = isAdmin
			? await this.getAdminMaxPasswordAgeDays()
			: await this.getMaxPasswordAgeDaysForUser(userId);
		if (maxAgeDays == null) return false;
		const ageDays = (Date.now() - Date.parse(passwordUpdatedAt)) / 86_400_000;
		return ageDays > maxAgeDays;
	}

	/**
	 * The complexity policy that applies to a sign-in, or null when none applies (no policy
	 * assigned, or the assigned policy is disabled). Resolution is by audience:
	 *  - admins → the global admin sign-in policy;
	 *  - a specific OAuth client → the policy of that client's environment (caller resolves
	 *    `environmentId` from the client);
	 *  - otherwise (no client) → the first enabled policy across the user's granted
	 *    environments (see {@link checkSignInPasswordComplexity} for the multi-policy gate).
	 */
	async getApplicablePolicyForSignIn(args: {
		userId: string;
		isAdmin: boolean;
		environmentId?: string | null;
	}): Promise<PasswordPolicy | null> {
		const policy = args.isAdmin
			? await this.policyRepo.getAdminPolicy()
			: args.environmentId
				? await this.policyRepo.getPolicyForEnvironment(args.environmentId)
				: (await this.policyRepo.getEnabledPoliciesForUser(args.userId))[0] ?? null;
		// A disabled policy imposes no rules — treat it as "none applies" so callers
		// don't need to special-case it.
		return policy && policy.enabled ? policy : null;
	}

	/**
	 * Validates a candidate password against the policy applicable to this sign-in. When no
	 * policy applies, returns `ok: true` with a null policy. For a non-admin with no client
	 * in context, the password is gated against *every* enabled policy of the user's
	 * environments (fail if any rejects), and the returned `policy` is the first that failed
	 * (for the recovery checklist).
	 */
	async checkSignInPasswordComplexity(args: {
		userId: string;
		isAdmin: boolean;
		environmentId?: string | null;
		password: string;
		identifiers?: PasswordIdentifiers;
	}): Promise<{ ok: boolean; violations: PasswordPolicyViolation[]; policy: PasswordPolicy | null }> {
		const identifiers = args.identifiers ?? {};

		// Admin or client-scoped: a single applicable policy.
		if (args.isAdmin || args.environmentId) {
			const policy = await this.getApplicablePolicyForSignIn(args);
			if (!policy) return { ok: true, violations: [], policy: null };
			const result = validatePasswordAgainstPolicy(policy, args.password, identifiers);
			return { ok: result.ok, violations: result.violations, policy };
		}

		// Non-admin, no client: gate against every enabled policy of the user's environments.
		const policies = await this.policyRepo.getEnabledPoliciesForUser(args.userId);
		for (const policy of policies) {
			const result = validatePasswordAgainstPolicy(policy, args.password, identifiers);
			if (!result.ok) {
				return { ok: false, violations: result.violations, policy };
			}
		}
		return { ok: true, violations: [], policy: null };
	}
}
