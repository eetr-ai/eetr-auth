import { describe, expect, it } from "vitest";
import {
	draftToInput,
	emptyDraft,
	isPolicyDraftDirty,
	type PolicyDraft,
} from "./policy-draft";

const baseline: PolicyDraft = {
	...emptyDraft,
	name: "Strong",
	minLength: "8",
	maxLength: "",
	maxPasswordAgeDays: "90",
	environmentIds: ["env-a", "env-b"],
};

const withDraft = (patch: Partial<PolicyDraft>): PolicyDraft => ({ ...baseline, ...patch });

describe("isPolicyDraftDirty", () => {
	it("is clean for an identical draft", () => {
		expect(isPolicyDraftDirty(withDraft({}), baseline)).toBe(false);
	});

	it("ignores environment id ordering", () => {
		expect(isPolicyDraftDirty(withDraft({ environmentIds: ["env-b", "env-a"] }), baseline)).toBe(
			false,
		);
	});

	it("detects an added environment", () => {
		expect(
			isPolicyDraftDirty(withDraft({ environmentIds: ["env-a", "env-b", "env-c"] }), baseline),
		).toBe(true);
	});

	it("detects a removed environment", () => {
		expect(isPolicyDraftDirty(withDraft({ environmentIds: ["env-a"] }), baseline)).toBe(true);
	});

	it("ignores numeric formatting that parses to the same value", () => {
		expect(isPolicyDraftDirty(withDraft({ minLength: "08" }), baseline)).toBe(false);
	});

	it("ignores surrounding whitespace in the name", () => {
		expect(isPolicyDraftDirty(withDraft({ name: "  Strong  " }), baseline)).toBe(false);
	});

	it("detects a real name change", () => {
		expect(isPolicyDraftDirty(withDraft({ name: "Stronger" }), baseline)).toBe(true);
	});

	it('treats "no max length" and "max length 0" as different', () => {
		// "" persists as null (no maximum); "0" persists as 0. Genuinely different.
		expect(isPolicyDraftDirty(withDraft({ maxLength: "0" }), baseline)).toBe(true);
	});

	it("detects a toggled boolean", () => {
		expect(isPolicyDraftDirty(withDraft({ enabled: false }), baseline)).toBe(true);
		expect(isPolicyDraftDirty(withDraft({ rejectContainsIdentifier: true }), baseline)).toBe(true);
	});
});

describe("draftToInput", () => {
	it("maps an empty max length to null and trims the name", () => {
		const input = draftToInput(withDraft({ name: " Strong ", maxLength: "" }));
		expect(input.name).toBe("Strong");
		expect(input.maxLength).toBeNull();
	});

	it("clamps unparseable counts to 0 rather than NaN", () => {
		const input = draftToInput(withDraft({ minUppercase: "abc", minNumber: "-4" }));
		expect(input.minUppercase).toBe(0);
		expect(input.minNumber).toBe(0);
	});
});
