import type { PasswordPolicy } from "@/lib/repositories/password-policy.repository";

/**
 * Pure password-complexity validation against a {@link PasswordPolicy}.
 *
 * Enforced today when an admin changes their own password (against the admin sign-in
 * policy). Wiring it into the remaining password-set flows (createUser/updateUser/reset
 * for non-admins) is a later step.
 */

export type PasswordPolicyViolation =
	| { code: "too_short"; min: number }
	| { code: "too_long"; max: number }
	| { code: "too_few_uppercase"; min: number; found: number }
	| { code: "too_few_lowercase"; min: number; found: number }
	| { code: "too_few_number"; min: number; found: number }
	| { code: "too_few_special"; min: number; found: number }
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

/** Number of characters in `password` matching the global `pattern`. */
function countMatches(password: string, pattern: RegExp): number {
	return (password.match(pattern) ?? []).length;
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
	if (policy.minUppercase > 0) {
		const found = countMatches(password, /[A-Z]/g);
		if (found < policy.minUppercase) {
			violations.push({ code: "too_few_uppercase", min: policy.minUppercase, found });
		}
	}
	if (policy.minLowercase > 0) {
		const found = countMatches(password, /[a-z]/g);
		if (found < policy.minLowercase) {
			violations.push({ code: "too_few_lowercase", min: policy.minLowercase, found });
		}
	}
	if (policy.minNumber > 0) {
		const found = countMatches(password, /[0-9]/g);
		if (found < policy.minNumber) {
			violations.push({ code: "too_few_number", min: policy.minNumber, found });
		}
	}
	if (policy.minSpecial > 0) {
		const found = countMatches(password, /[^A-Za-z0-9]/g);
		if (found < policy.minSpecial) {
			violations.push({ code: "too_few_special", min: policy.minSpecial, found });
		}
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

function plural(n: number, noun: string): string {
	return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** Human-readable requirement phrase for a single violation. */
function violationRequirement(violation: PasswordPolicyViolation): string {
	switch (violation.code) {
		case "too_short":
			return `at least ${plural(violation.min, "character")}`;
		case "too_long":
			return `at most ${plural(violation.max, "character")}`;
		case "too_few_uppercase":
			return `at least ${plural(violation.min, "uppercase letter")}`;
		case "too_few_lowercase":
			return `at least ${plural(violation.min, "lowercase letter")}`;
		case "too_few_number":
			return `at least ${plural(violation.min, "number")}`;
		case "too_few_special":
			return `at least ${plural(violation.min, "special character")}`;
		case "contains_identifier":
			return "no part of your username or email address";
	}
}

export interface PasswordPolicyRequirement {
	/** The violation this requirement maps to; the rule is met when that code is absent. */
	code: PasswordPolicyViolation["code"];
	/** Imperative checklist label, e.g. "At least 2 special characters". */
	label: string;
}

/**
 * The active rules of `policy` as a checklist, for live "as you type" feedback. Pair with
 * {@link validatePasswordAgainstPolicy}: a requirement is satisfied when its `code` is not
 * among the returned violations. Empty for a disabled policy (no rules apply).
 */
export function listPolicyRequirements(policy: PasswordPolicy): PasswordPolicyRequirement[] {
	if (!policy.enabled) return [];
	const requirements: PasswordPolicyRequirement[] = [
		{ code: "too_short", label: `At least ${plural(policy.minLength, "character")}` },
	];
	if (policy.maxLength !== null) {
		requirements.push({ code: "too_long", label: `At most ${plural(policy.maxLength, "character")}` });
	}
	if (policy.minUppercase > 0) {
		requirements.push({
			code: "too_few_uppercase",
			label: `At least ${plural(policy.minUppercase, "uppercase letter")}`,
		});
	}
	if (policy.minLowercase > 0) {
		requirements.push({
			code: "too_few_lowercase",
			label: `At least ${plural(policy.minLowercase, "lowercase letter")}`,
		});
	}
	if (policy.minNumber > 0) {
		requirements.push({
			code: "too_few_number",
			label: `At least ${plural(policy.minNumber, "number")}`,
		});
	}
	if (policy.minSpecial > 0) {
		requirements.push({
			code: "too_few_special",
			label: `At least ${plural(policy.minSpecial, "special character")}`,
		});
	}
	if (policy.rejectContainsIdentifier) {
		requirements.push({
			code: "contains_identifier",
			label: "No part of your username or email address",
		});
	}
	return requirements;
}

/**
 * Builds a single user-facing sentence describing why a password failed the policy.
 * Returns an empty string when there are no violations.
 */
export function summarizePasswordPolicyViolations(violations: PasswordPolicyViolation[]): string {
	if (violations.length === 0) return "";
	return `Password does not meet the policy: it must contain ${violations
		.map(violationRequirement)
		.join(", ")}.`;
}
