import type { Environment } from "@/lib/repositories/environment.repository";

/** Form state for the environment panel. One shape serves create and edit. */
export interface EnvironmentDraft {
	/** The stable identifier: the `environment` JWT claim and the activity-log value. */
	name: string;
	/** Human-facing label. Blank means "not set" and surfaces fall back to `name`. */
	displayName: string;
}

export const emptyEnvironmentDraft: EnvironmentDraft = {
	name: "",
	displayName: "",
};

export function draftFromEnvironment(env: Environment): EnvironmentDraft {
	return { name: env.name, displayName: env.displayName ?? "" };
}

/**
 * Signature of everything the draft would persist. Both fields are trimmed because
 * that is how the service stores them, so padding is not an edit.
 */
function environmentSignature(draft: EnvironmentDraft): string {
	return JSON.stringify([draft.name.trim(), draft.displayName.trim()]);
}

/** True when `draft` would save something different from `baseline`. */
export function isEnvironmentDraftDirty(
	draft: EnvironmentDraft,
	baseline: EnvironmentDraft
): boolean {
	return environmentSignature(draft) !== environmentSignature(baseline);
}
