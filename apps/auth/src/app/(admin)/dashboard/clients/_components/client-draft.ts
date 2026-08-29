import type { ClientClaimValueType } from "@/lib/repositories/client-claim.repository";

/** One editable custom-claim row. Blank names are scaffolding, not data. */
export interface ClaimDraft {
	claimName: string;
	claimValue: string;
	valueType: ClientClaimValueType;
}

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
	isTest: boolean;
	claims: ClaimDraft[];
}

/** Form state for the client panel. One shape serves create and edit. */
export interface ClientDraft {
	name: string;
	/** Immutable after creation, so the edit panel shows it read-only. */
	environmentId: string;
	/**
	 * Test client: its sign-in page lists only test users. Immutable after creation for
	 * the same reason as `environmentId` -- flipping it would change who can authenticate
	 * against a client that already has live tokens.
	 */
	isTest: boolean;
	/** Kept as a list with blanks allowed so rows can be added before being typed. */
	redirectUris: string[];
	scopeIds: string[];
	/** Custom JWT claims injected into this client's access tokens. */
	claims: ClaimDraft[];
	/** Create-only; blank means "no expiry". */
	expiresAt: string;
}

export const emptyDraft: ClientDraft = {
	name: "",
	environmentId: "",
	isTest: false,
	redirectUris: [""],
	scopeIds: [],
	claims: [],
	expiresAt: "",
};

export function draftFromClient(client: ClientDetails): ClientDraft {
	return {
		name: client.name ?? "",
		environmentId: client.environmentId,
		isTest: client.isTest,
		// A trailing blank row would otherwise read as an unsaved edit.
		redirectUris: client.redirectUris.length > 0 ? [...client.redirectUris] : [""],
		scopeIds: [...client.scopeIds],
		claims: client.claims.map((claim) => ({ ...claim })),
		expiresAt: client.expiresAt ?? "",
	};
}

/** Blank rows are UI scaffolding, not data. */
export function cleanRedirectUris(uris: string[]): string[] {
	return uris.map((uri) => uri.trim()).filter(Boolean);
}

/** Same idea for claims: a row with no name was never filled in. */
export function cleanClaims(claims: ClaimDraft[]): ClaimDraft[] {
	return claims
		.map((claim) => ({ ...claim, claimName: claim.claimName.trim() }))
		.filter((claim) => claim.claimName.length > 0);
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
		draft.isTest,
		cleanRedirectUris(draft.redirectUris),
		[...draft.scopeIds].sort(),
		// Sorted by name: claim order is not persisted, so a reorder is not a real edit.
		cleanClaims(draft.claims)
			.map((claim) => [claim.claimName, claim.claimValue, claim.valueType])
			.sort((a, b) => a[0].localeCompare(b[0])),
		draft.expiresAt.trim(),
	]);
}

/** True when `draft` would save something different from `baseline`. */
export function isClientDraftDirty(draft: ClientDraft, baseline: ClientDraft): boolean {
	return clientSignature(draft) !== clientSignature(baseline);
}
