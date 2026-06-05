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

	async create(
		input: CreatePasswordPolicyInput,
		environmentIds: string[],
		actorUserId: string | null = null
	): Promise<PasswordPolicyResult> {
		const ruleError = validateRules(input);
		if (ruleError) {
			return { ok: false, error: ruleError };
		}
		const conflict = await this.findEnvironmentConflict(environmentIds, null);
		if (conflict) {
			return { ok: false, error: conflict };
		}

		const id = crypto.randomUUID();
		const now = new Date().toISOString();
		await this.policyRepo.create(id, { ...input, name: input.name.trim() }, now);
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
		await this.policyRepo.update(id, patch, now);
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
}
