import { describe, expect, it } from "vitest";
import {
	cleanClaims,
	cleanHome,
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
			isTest: false,
			homeUrl: null,
			homeDisplayName: null,
			showOnHome: false,
			claims: [],
		};
		const draft = draftFromClient(client);
		expect(draft.redirectUris).toEqual([""]);
		expect(draft.name).toBe("");
		// …and that blank row must not read as an unsaved edit.
		expect(isClientDraftDirty(draft, draft)).toBe(false);
	});

	it("carries isTest through, so the edit panel reflects what was created", () => {
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
			isTest: true,
			homeUrl: null,
			homeDisplayName: null,
			showOnHome: false,
			claims: [],
		};
		expect(draftFromClient(client).isTest).toBe(true);
	});

	it("carries the home link through", () => {
		const client: ClientDetails = {
			id: "c1",
			clientId: "cid",
			environmentId: "env-a",
			name: "Web app",
			expiresAt: null,
			redirectUris: [],
			scopeIds: [],
			tokenEndpointAuthMethod: "client_secret_basic",
			isDynamic: false,
			isTest: false,
			homeUrl: "https://app.example",
			homeDisplayName: "My App",
			showOnHome: true,
			claims: [],
		};
		const draft = draftFromClient(client);
		expect(cleanHome(draft)).toEqual({
			homeUrl: "https://app.example",
			homeDisplayName: "My App",
			showOnHome: true,
		});
		expect(isClientDraftDirty(draft, draft)).toBe(false);
	});
});

describe("isClientDraftDirty and isTest", () => {
	// The create panel's checkbox is the only place isTest is ever set, so if the dirty
	// guard ignored it, ticking the box on a new client would read as "no changes".
	it("treats toggling isTest as a real change", () => {
		expect(isClientDraftDirty({ ...emptyDraft, isTest: true }, emptyDraft)).toBe(true);
	});

	it("treats an unchanged isTest as clean", () => {
		expect(
			isClientDraftDirty({ ...emptyDraft, isTest: true }, { ...emptyDraft, isTest: true })
		).toBe(false);
	});
});

describe("cleanClaims", () => {
	it("trims names and drops rows that were never filled in", () => {
		expect(
			cleanClaims([
				{ claimName: "  tenant  ", claimValue: "acme", valueType: "string" },
				{ claimName: "   ", claimValue: "", valueType: "string" },
			])
		).toEqual([{ claimName: "tenant", claimValue: "acme", valueType: "string" }]);
	});
});

describe("isClientDraftDirty — custom claims", () => {
	const withClaims = (claims: ClientDraft["claims"]): ClientDraft => ({ ...baseline, claims });

	it("ignores a blank claim row", () => {
		// Clicking "Add claim" is scaffolding, not an edit.
		expect(
			isClientDraftDirty(
				withClaims([{ claimName: "  ", claimValue: "", valueType: "string" }]),
				baseline
			)
		).toBe(false);
	});

	it("ignores a reorder, since claim order is not persisted", () => {
		const a = withClaims([
			{ claimName: "tenant", claimValue: "acme", valueType: "string" },
			{ claimName: "tier", claimValue: "3", valueType: "number" },
		]);
		const b = withClaims([
			{ claimName: "tier", claimValue: "3", valueType: "number" },
			{ claimName: "tenant", claimValue: "acme", valueType: "string" },
		]);
		expect(isClientDraftDirty(a, b)).toBe(false);
	});

	it("is dirty when a claim value changes", () => {
		expect(
			isClientDraftDirty(
				withClaims([{ claimName: "tenant", claimValue: "beta", valueType: "string" }]),
				withClaims([{ claimName: "tenant", claimValue: "acme", valueType: "string" }])
			)
		).toBe(true);
	});

	it("is dirty when only the value type changes", () => {
		expect(
			isClientDraftDirty(
				withClaims([{ claimName: "tier", claimValue: "3", valueType: "number" }]),
				withClaims([{ claimName: "tier", claimValue: "3", valueType: "string" }])
			)
		).toBe(true);
	});
});

describe("cleanHome", () => {
	it("trims and turns blanks into null", () => {
		expect(
			cleanHome(withDraft({ homeUrl: " https://app.example ", homeDisplayName: "  ", showOnHome: true })),
		).toEqual({ homeUrl: "https://app.example", homeDisplayName: null, showOnHome: true });
	});

	it("drops the show flag when there is no URL", () => {
		expect(cleanHome(withDraft({ homeUrl: " ", showOnHome: true }))).toEqual({
			homeUrl: null,
			homeDisplayName: null,
			showOnHome: false,
		});
	});
});

describe("isClientDraftDirty home link", () => {
	it("detects a new home URL", () => {
		expect(isClientDraftDirty(withDraft({ homeUrl: "https://app.example" }), baseline)).toBe(true);
	});

	it("detects ticking show on home", () => {
		const linked = withDraft({ homeUrl: "https://app.example" });
		expect(isClientDraftDirty({ ...linked, showOnHome: true }, linked)).toBe(true);
	});

	it("ignores whitespace around the home URL", () => {
		const linked = withDraft({ homeUrl: "https://app.example" });
		expect(isClientDraftDirty({ ...linked, homeUrl: " https://app.example " }, linked)).toBe(false);
	});
});
