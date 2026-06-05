import type { PasswordPolicy } from "@/lib/repositories/password-policy.repository";

/**
 * Pure password-complexity validation against a {@link PasswordPolicy}.
 *
 * NOTE: as of this iteration this utility is intentionally NOT wired into the
 * password-set flows (createUser/updateUser/changePassword/reset). It exists so the
 * rules are defined and unit-tested in one place; enforcement is a later step.
 */

export type PasswordPolicyViolation =
	| { code: "too_short"; min: number }
	| { code: "too_long"; max: number }
	| { code: "missing_uppercase" }
	| { code: "missing_lowercase" }
	| { code: "missing_number" }
	| { code: "missing_special" }
	| { code: "contains_identifier" };

export interface PasswordIdentifiers {
	username?: string | null;
	email?: string | null;
}

export interface PasswordPolicyCheckResult {
	ok: boolean;
	violations: PasswordPolicyViolation[];
}

/** Identifiers shorter than this are ignored by the "contains identifier" check. */
const MIN_IDENTIFIER_LENGTH = 3;

function emailLocalPart(email: string): string {
	const at = email.indexOf("@");
	return at === -1 ? email : email.slice(0, at);
}

/**
 * Validates `password` against `policy`. A disabled policy imposes no rules.
 * `identifiers` enables the optional "password must not contain the username or
 * email local-part" rule.
 */
export function validatePasswordAgainstPolicy(
	policy: PasswordPolicy,
	password: string,
	identifiers: PasswordIdentifiers = {}
): PasswordPolicyCheckResult {
	const violations: PasswordPolicyViolation[] = [];

	if (!policy.enabled) {
		return { ok: true, violations };
	}

	if (password.length < policy.minLength) {
		violations.push({ code: "too_short", min: policy.minLength });
	}
	if (policy.maxLength !== null && password.length > policy.maxLength) {
		violations.push({ code: "too_long", max: policy.maxLength });
	}
	if (policy.requireUppercase && !/[A-Z]/.test(password)) {
		violations.push({ code: "missing_uppercase" });
	}
	if (policy.requireLowercase && !/[a-z]/.test(password)) {
		violations.push({ code: "missing_lowercase" });
	}
	if (policy.requireNumber && !/[0-9]/.test(password)) {
		violations.push({ code: "missing_number" });
	}
	if (policy.requireSpecial && !/[^A-Za-z0-9]/.test(password)) {
		violations.push({ code: "missing_special" });
	}

	if (policy.rejectContainsIdentifier) {
		const haystack = password.toLowerCase();
		const candidates: string[] = [];
		if (identifiers.username) {
			candidates.push(identifiers.username.trim().toLowerCase());
		}
		if (identifiers.email) {
			candidates.push(emailLocalPart(identifiers.email).trim().toLowerCase());
		}
		const matches = candidates.some(
			(candidate) => candidate.length >= MIN_IDENTIFIER_LENGTH && haystack.includes(candidate)
		);
		if (matches) {
			violations.push({ code: "contains_identifier" });
		}
	}

	return { ok: violations.length === 0, violations };
}
