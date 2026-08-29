import type { Scope } from "@/lib/repositories/scope.repository";

/** Form state for the scope panel. One shape serves create and edit. */
export interface ScopeDraft {
	/** The protocol token. Create-only — renaming it would break existing clients. */
	scopeName: string;
	/** Short consent-screen label. Blank falls back to `scopeName`. */
	displayName: string;
	/** One-sentence consent-screen explanation. */
	description: string;
}

export const emptyScopeDraft: ScopeDraft = {
	scopeName: "",
	displayName: "",
	description: "",
};

export function draftFromScope(scope: Scope): ScopeDraft {
	return {
		scopeName: scope.scopeName,
		displayName: scope.displayName ?? "",
		description: scope.description ?? "",
	};
}

/**
 * Signature of everything the draft would persist. `scopeName` is included even though
 * it is only editable on create: the same signature then serves both modes.
 */
function scopeSignature(draft: ScopeDraft): string {
	return JSON.stringify([
		draft.scopeName.trim(),
		draft.displayName.trim(),
		draft.description.trim(),
	]);
}

/** True when `draft` would save something different from `baseline`. */
export function isScopeDraftDirty(draft: ScopeDraft, baseline: ScopeDraft): boolean {
	return scopeSignature(draft) !== scopeSignature(baseline);
}
