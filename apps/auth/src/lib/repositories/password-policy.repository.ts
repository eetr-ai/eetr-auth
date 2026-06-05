export interface PasswordPolicy {
	id: string;
	name: string;
	enabled: boolean;
	minLength: number;
	maxLength: number | null;
	requireUppercase: boolean;
	requireLowercase: boolean;
	requireNumber: boolean;
	requireSpecial: boolean;
	rejectContainsIdentifier: boolean;
	/** 0 = no expiry. */
	maxPasswordAgeDays: number;
	createdAt: string;
	updatedAt: string;
}

export interface PasswordPolicyWithEnvironments extends PasswordPolicy {
	environmentIds: string[];
}

export interface CreatePasswordPolicyInput {
	name: string;
	enabled: boolean;
	minLength: number;
	maxLength: number | null;
	requireUppercase: boolean;
	requireLowercase: boolean;
	requireNumber: boolean;
	requireSpecial: boolean;
	rejectContainsIdentifier: boolean;
	maxPasswordAgeDays: number;
}

export type UpdatePasswordPolicyInput = Partial<CreatePasswordPolicyInput>;

export interface PasswordPolicyRepository {
	list(): Promise<PasswordPolicy[]>;
	listWithEnvironments(): Promise<PasswordPolicyWithEnvironments[]>;
	getById(id: string): Promise<PasswordPolicy | null>;
	getWithEnvironments(id: string): Promise<PasswordPolicyWithEnvironments | null>;
	create(id: string, input: CreatePasswordPolicyInput, now: string): Promise<void>;
	update(id: string, updates: UpdatePasswordPolicyInput, now: string): Promise<void>;
	delete(id: string): Promise<void>;
	/** Replace the full set of environment assignments for a policy. */
	setEnvironments(policyId: string, environmentIds: string[]): Promise<void>;
	getPolicyForEnvironment(environmentId: string): Promise<PasswordPolicy | null>;
	/**
	 * Strictest (smallest) max age across the enabled policies assigned to the
	 * environments the given user is granted (via users_environments), considering
	 * only policies that set a max age (> 0). Null when none apply. Used by the
	 * login age gate so the policy follows the user's environment access.
	 */
	getStrictestEnabledMaxAgeDaysForUser(userId: string): Promise<number | null>;
}
