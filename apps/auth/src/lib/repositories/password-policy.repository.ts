export interface PasswordPolicy {
	id: string;
	name: string;
	enabled: boolean;
	minLength: number;
	maxLength: number | null;
	/** Minimum required uppercase letters (A-Z). 0 = not required. */
	minUppercase: number;
	/** Minimum required lowercase letters (a-z). 0 = not required. */
	minLowercase: number;
	/** Minimum required digits (0-9). 0 = not required. */
	minNumber: number;
	/** Minimum required special (non-alphanumeric) characters. 0 = not required. */
	minSpecial: number;
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
	minUppercase: number;
	minLowercase: number;
	minNumber: number;
	minSpecial: number;
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
	 * The policy selected as the admin sign-in policy on the site_settings singleton, or
	 * null when none is set. Admins have no environment, so this is the admin equivalent of
	 * {@link getPolicyForEnvironment}.
	 */
	getAdminPolicy(): Promise<PasswordPolicy | null>;
	/**
	 * Strictest (smallest) max age across the enabled policies assigned to the
	 * environments the given user is granted (via users_environments), considering
	 * only policies that set a max age (> 0). Null when none apply. Used by the
	 * login age gate so the policy follows the user's environment access.
	 */
	getStrictestEnabledMaxAgeDaysForUser(userId: string): Promise<number | null>;
	/**
	 * Distinct enabled policies assigned to any environment the given user is granted
	 * (via users_environments). Used by the sign-in complexity gate when no specific
	 * client/environment is in context, so the policy follows the user's access.
	 */
	getEnabledPoliciesForUser(userId: string): Promise<PasswordPolicy[]>;
}
