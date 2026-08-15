export interface ClientDetails {
	id: string;
	clientId: string;
	environmentId: string;
	name: string | null;
	expiresAt: string | null;
	redirectUris: string[];
	scopeIds: string[];
	tokenEndpointAuthMethod: string;
	isDynamic: boolean;
}

/** Form state for the client panel. One shape serves create and edit. */
export interface ClientDraft {
	name: string;
	/** Immutable after creation, so the edit panel shows it read-only. */
	environmentId: string;
	/** Kept as a list with blanks allowed so rows can be added before being typed. */
	redirectUris: string[];
	scopeIds: string[];
	/** Create-only; blank means "no expiry". */
	expiresAt: string;
}

export const emptyDraft: ClientDraft = {
	name: "",
	environmentId: "",
	redirectUris: [""],
	scopeIds: [],
	expiresAt: "",
};

export function draftFromClient(client: ClientDetails): ClientDraft {
	return {
		name: client.name ?? "",
		environmentId: client.environmentId,
		// A trailing blank row would otherwise read as an unsaved edit.
		redirectUris: client.redirectUris.length > 0 ? [...client.redirectUris] : [""],
		scopeIds: [...client.scopeIds],
		expiresAt: client.expiresAt ?? "",
	};
}

/** Blank rows are UI scaffolding, not data. */
export function cleanRedirectUris(uris: string[]): string[] {
	return uris.map((uri) => uri.trim()).filter(Boolean);
}

/**
 * Signature of everything the draft would persist. Redirect URIs keep their
 * order (it is meaningful to no one, but the server stores a list, so a reorder
 * is a real write); scope ids are sorted because their order is just tick order.
 */
function clientSignature(draft: ClientDraft): string {
	return JSON.stringify([
		draft.name.trim(),
		draft.environmentId,
		cleanRedirectUris(draft.redirectUris),
		[...draft.scopeIds].sort(),
		draft.expiresAt.trim(),
	]);
}

/** True when `draft` would save something different from `baseline`. */
export function isClientDraftDirty(draft: ClientDraft, baseline: ClientDraft): boolean {
	return clientSignature(draft) !== clientSignature(baseline);
}
