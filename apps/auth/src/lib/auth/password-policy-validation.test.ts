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
		requireUppercase: false,
		requireLowercase: false,
		requireNumber: false,
		requireSpecial: false,
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
			requireUppercase: true,
			requireLowercase: true,
			requireNumber: true,
			requireSpecial: true,
		});
		const result = validatePasswordAgainstPolicy(policy, "Abcdef1!");
		expect(result.ok).toBe(true);
	});

	it("flags too_short and too_long", () => {
		expect(codes(makePolicy({ minLength: 8 }), "short")).toContain("too_short");
		expect(codes(makePolicy({ minLength: 1, maxLength: 4 }), "toolong")).toContain("too_long");
	});

	it("flags each missing character class independently", () => {
		expect(codes(makePolicy({ requireUppercase: true }), "lowercase1!")).toContain("missing_uppercase");
		expect(codes(makePolicy({ requireLowercase: true }), "UPPER123!")).toContain("missing_lowercase");
		expect(codes(makePolicy({ requireNumber: true }), "NoDigits!")).toContain("missing_number");
		expect(codes(makePolicy({ requireSpecial: true }), "NoSpecial1")).toContain("missing_special");
	});

	it("reports multiple violations at once", () => {
		const policy = makePolicy({ minLength: 10, requireUppercase: true, requireNumber: true });
		const result = validatePasswordAgainstPolicy(policy, "abc");
		expect(result.ok).toBe(false);
		expect(result.violations.map((v) => v.code)).toEqual(
			expect.arrayContaining(["too_short", "missing_uppercase", "missing_number"])
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
