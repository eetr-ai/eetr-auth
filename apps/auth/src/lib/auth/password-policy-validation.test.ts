import { describe, expect, it } from "vitest";

import type { PasswordPolicy } from "@/lib/repositories/password-policy.repository";
import { validatePasswordAgainstPolicy } from "@/lib/auth/password-policy-validation";

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

function codes(policy: PasswordPolicy, password: string, ids = {}) {
	return validatePasswordAgainstPolicy(policy, password, ids).violations.map((v) => v.code);
}

describe("validatePasswordAgainstPolicy", () => {
	it("imposes no rules when the policy is disabled", () => {
		const result = validatePasswordAgainstPolicy(makePolicy({ enabled: false, minLength: 100 }), "x");
		expect(result.ok).toBe(true);
		expect(result.violations).toEqual([]);
	});

	it("passes a compliant password", () => {
		const policy = makePolicy({
			minLength: 8,
			minUppercase: 1,
			minLowercase: 1,
			minNumber: 1,
			minSpecial: 1,
		});
		const result = validatePasswordAgainstPolicy(policy, "Abcdef1!");
		expect(result.ok).toBe(true);
	});

	it("flags too_short and too_long", () => {
		expect(codes(makePolicy({ minLength: 8 }), "short")).toContain("too_short");
		expect(codes(makePolicy({ minLength: 1, maxLength: 4 }), "toolong")).toContain("too_long");
	});

	it("flags each character class with too few occurrences independently", () => {
		expect(codes(makePolicy({ minUppercase: 1 }), "lowercase1!")).toContain("too_few_uppercase");
		expect(codes(makePolicy({ minLowercase: 1 }), "UPPER123!")).toContain("too_few_lowercase");
		expect(codes(makePolicy({ minNumber: 1 }), "NoDigits!")).toContain("too_few_number");
		expect(codes(makePolicy({ minSpecial: 1 }), "NoSpecial1")).toContain("too_few_special");
	});

	it("enforces a minimum count greater than one per class", () => {
		// Two specials required; only one present -> violation reporting the shortfall.
		const result = validatePasswordAgainstPolicy(makePolicy({ minSpecial: 2 }), "Abcdefg1!");
		const special = result.violations.find((v) => v.code === "too_few_special");
		expect(special).toEqual({ code: "too_few_special", min: 2, found: 1 });

		// Three uppercase required and present -> passes that class.
		expect(codes(makePolicy({ minLength: 1, minUppercase: 3 }), "ABCdef")).not.toContain(
			"too_few_uppercase"
		);
	});

	it("reports multiple violations at once", () => {
		const policy = makePolicy({ minLength: 10, minUppercase: 1, minNumber: 1 });
		const result = validatePasswordAgainstPolicy(policy, "abc");
		expect(result.ok).toBe(false);
		expect(result.violations.map((v) => v.code)).toEqual(
			expect.arrayContaining(["too_short", "too_few_uppercase", "too_few_number"])
		);
	});

	describe("rejectContainsIdentifier", () => {
		const policy = makePolicy({ minLength: 1, rejectContainsIdentifier: true });

		it("rejects a password containing the username (case-insensitive)", () => {
			expect(codes(policy, "xxALICExx", { username: "alice" })).toContain("contains_identifier");
		});

		it("rejects a password containing the email local-part", () => {
			expect(codes(policy, "my-bob-pw", { email: "bob@example.com" })).toContain("contains_identifier");
		});

		it("ignores the domain part of the email", () => {
			expect(codes(policy, "loves-example", { email: "bob@example.com" })).not.toContain(
				"contains_identifier"
			);
		});

		it("ignores identifiers shorter than the minimum length", () => {
			expect(codes(policy, "joe-pw", { username: "jo" })).not.toContain("contains_identifier");
		});

		it("does not run when the rule is disabled", () => {
			const off = makePolicy({ minLength: 1, rejectContainsIdentifier: false });
			expect(codes(off, "alice", { username: "alice" })).not.toContain("contains_identifier");
		});
	});
});
