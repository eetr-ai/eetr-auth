import type { UserRecord } from "@/lib/repositories/admin.repository";

/** Form state for the user panel. One shape serves create and edit. */
export interface UserDraft {
	username: string;
	name: string;
	email: string;
	/** Write-only. Required on create; blank on edit means "leave unchanged". */
	password: string;
	isAdmin: boolean;
	environmentIds: string[];
	/** A `staging/` key for a picked-but-unsaved avatar, promoted on save. */
	avatarStagedKey: string | null;
	/** Local object URL for previewing that file before it is saved. */
	avatarPreviewUrl: string | null;
}

export const emptyDraft: UserDraft = {
	username: "",
	name: "",
	email: "",
	password: "",
	isAdmin: true,
	environmentIds: [],
	avatarStagedKey: null,
	avatarPreviewUrl: null,
};

export function draftFromUser(user: UserRecord): UserDraft {
	return {
		username: user.username,
		name: user.name ?? "",
		email: user.email ?? "",
		password: "",
		isAdmin: user.isAdmin,
		environmentIds: [...(user.environmentIds ?? [])],
		avatarStagedKey: null,
		avatarPreviewUrl: null,
	};
}

/**
 * Signature of everything the draft would persist.
 *
 * Text fields are trimmed because that is how they are stored, and
 * `environmentIds` is sorted because its order is just the order the checkboxes
 * were ticked. `password` is compared raw: it is write-only, so any non-empty
 * value is a change by definition.
 */
function userSignature(draft: UserDraft): string {
	return JSON.stringify([
		draft.username.trim(),
		draft.name.trim(),
		draft.email.trim(),
		draft.password,
		draft.isAdmin,
		[...draft.environmentIds].sort(),
		// A picked-but-unsaved photo is an unsaved change like any other.
		draft.avatarStagedKey,
	]);
}

/** True when `draft` would save something different from `baseline`. */
export function isUserDraftDirty(draft: UserDraft, baseline: UserDraft): boolean {
	return userSignature(draft) !== userSignature(baseline);
}
