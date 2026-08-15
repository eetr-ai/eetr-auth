import { describe, expect, it } from "vitest";
import {
	cleanRedirectUris,
	draftFromClient,
	emptyDraft,
	isClientDraftDirty,
	type ClientDetails,
	type ClientDraft,
} from "./client-draft";

const baseline: ClientDraft = {
	...emptyDraft,
	name: "Web app",
	environmentId: "env-a",
	redirectUris: ["https://a.example/cb", "https://b.example/cb"],
	scopeIds: ["s1", "s2"],
};

const withDraft = (patch: Partial<ClientDraft>): ClientDraft => ({ ...baseline, ...patch });

describe("isClientDraftDirty", () => {
	it("is clean for an identical draft", () => {
		expect(isClientDraftDirty(withDraft({}), baseline)).toBe(false);
	});

	it("ignores a trailing blank redirect row", () => {
		// Adding an empty row is UI scaffolding, not an edit.
		expect(
			isClientDraftDirty(
				withDraft({ redirectUris: [...baseline.redirectUris, "  "] }),
				baseline,
			),
		).toBe(false);
	});

	it("detects a changed redirect uri", () => {
		expect(
			isClientDraftDirty(withDraft({ redirectUris: ["https://a.example/other"] }), baseline),
		).toBe(true);
	});

	it("treats reordered redirect uris as a change", () => {
		// The server stores an ordered list, so a reorder really is a write.
		expect(
			isClientDraftDirty(
				withDraft({ redirectUris: [...baseline.redirectUris].reverse() }),
				baseline,
			),
		).toBe(true);
	});

	it("ignores scope ordering", () => {
		expect(isClientDraftDirty(withDraft({ scopeIds: ["s2", "s1"] }), baseline)).toBe(false);
	});

	it("detects a scope change", () => {
		expect(isClientDraftDirty(withDraft({ scopeIds: ["s1"] }), baseline)).toBe(true);
	});

	it("ignores surrounding whitespace in the name", () => {
		expect(isClientDraftDirty(withDraft({ name: "  Web app  " }), baseline)).toBe(false);
	});
});

describe("cleanRedirectUris", () => {
	it("trims entries and drops blanks", () => {
		expect(cleanRedirectUris([" https://a ", "", "   ", "https://b"])).toEqual([
			"https://a",
			"https://b",
		]);
	});
});

describe("draftFromClient", () => {
	it("keeps one blank row when the client has no redirect uris", () => {
		const client: ClientDetails = {
			id: "c1",
			clientId: "cid",
			environmentId: "env-a",
			name: null,
			expiresAt: null,
			redirectUris: [],
			scopeIds: [],
			tokenEndpointAuthMethod: "client_secret_basic",
			isDynamic: false,
		};
		const draft = draftFromClient(client);
		expect(draft.redirectUris).toEqual([""]);
		expect(draft.name).toBe("");
		// …and that blank row must not read as an unsaved edit.
		expect(isClientDraftDirty(draft, draft)).toBe(false);
	});
});
