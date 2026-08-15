import type {
	CreatePasswordPolicyInput,
	PasswordPolicyWithEnvironments,
} from "@/lib/repositories/password-policy.repository";

/** Form state for the policy panel. Numeric fields stay strings while editing. */
export interface PolicyDraft {
	name: string;
	enabled: boolean;
	minLength: string;
	maxLength: string;
	minUppercase: string;
	minLowercase: string;
	minNumber: string;
	minSpecial: string;
	rejectContainsIdentifier: boolean;
	maxPasswordAgeDays: string;
	environmentIds: string[];
}

export const emptyDraft: PolicyDraft = {
	name: "",
	enabled: true,
	minLength: "8",
	maxLength: "",
	minUppercase: "0",
	minLowercase: "0",
	minNumber: "0",
	minSpecial: "0",
	rejectContainsIdentifier: false,
	maxPasswordAgeDays: "0",
	environmentIds: [],
};

// Minimum-count fields rendered as number inputs: [draft key, label].
export const COUNT_FIELDS: Array<[keyof PolicyDraft, string]> = [
	["minUppercase", "Min uppercase"],
	["minLowercase", "Min lowercase"],
	["minNumber", "Min numbers"],
	["minSpecial", "Min special chars"],
];

export function draftFromPolicy(policy: PasswordPolicyWithEnvironments): PolicyDraft {
	return {
		name: policy.name,
		enabled: policy.enabled,
		minLength: String(policy.minLength),
		maxLength: policy.maxLength === null ? "" : String(policy.maxLength),
		minUppercase: String(policy.minUppercase),
		minLowercase: String(policy.minLowercase),
		minNumber: String(policy.minNumber),
		minSpecial: String(policy.minSpecial),
		rejectContainsIdentifier: policy.rejectContainsIdentifier,
		maxPasswordAgeDays: String(policy.maxPasswordAgeDays),
		environmentIds: [...policy.environmentIds],
	};
}

export function draftToInput(draft: PolicyDraft): CreatePasswordPolicyInput {
	const parsedMax = draft.maxLength.trim();
	const count = (value: string) => Math.max(0, Number.parseInt(value, 10) || 0);
	return {
		name: draft.name.trim(),
		enabled: draft.enabled,
		minLength: Number.parseInt(draft.minLength, 10) || 0,
		maxLength: parsedMax === "" ? null : Number.parseInt(parsedMax, 10) || 0,
		minUppercase: count(draft.minUppercase),
		minLowercase: count(draft.minLowercase),
		minNumber: count(draft.minNumber),
		minSpecial: count(draft.minSpecial),
		rejectContainsIdentifier: draft.rejectContainsIdentifier,
		maxPasswordAgeDays: Number.parseInt(draft.maxPasswordAgeDays, 10) || 0,
	};
}

/**
 * Signature of everything a draft would actually persist.
 *
 * Compared on the persisted projection rather than the raw draft so that
 * "8" vs "08", or a name the user padded with spaces, are not treated as
 * changes. `environmentIds` is sorted because its order is just the order the
 * checkboxes were ticked and carries no meaning.
 */
function policySignature(draft: PolicyDraft): string {
	return JSON.stringify([draftToInput(draft), [...draft.environmentIds].sort()]);
}

/** True when `draft` would save something different from `baseline`. */
export function isPolicyDraftDirty(draft: PolicyDraft, baseline: PolicyDraft): boolean {
	return policySignature(draft) !== policySignature(baseline);
}

/** Row subtitle, e.g. `min 8 · 1×A-Z/1×0-9 · expires 90d`. */
export function summarize(policy: PasswordPolicyWithEnvironments): string {
	const parts = [`min ${policy.minLength}`];
	if (policy.maxLength !== null) parts.push(`max ${policy.maxLength}`);
	const classes = [
		policy.minUppercase > 0 && `${policy.minUppercase}×A-Z`,
		policy.minLowercase > 0 && `${policy.minLowercase}×a-z`,
		policy.minNumber > 0 && `${policy.minNumber}×0-9`,
		policy.minSpecial > 0 && `${policy.minSpecial}×symbol`,
	].filter(Boolean);
	if (classes.length) parts.push(classes.join("/"));
	if (policy.rejectContainsIdentifier) parts.push("no identifier");
	parts.push(policy.maxPasswordAgeDays > 0 ? `expires ${policy.maxPasswordAgeDays}d` : "no expiry");
	return parts.join(" · ");
}
