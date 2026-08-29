import { describe, expect, it } from "vitest";
import {
	draftFromEnvironment,
	emptyEnvironmentDraft,
	isEnvironmentDraftDirty,
} from "./environment-draft";

describe("draftFromEnvironment", () => {
	it("maps a null display name to a blank field", () => {
		// The input must be controlled, so null cannot reach it.
		expect(draftFromEnvironment({ id: "e1", name: "prod", displayName: null })).toEqual({
			name: "prod",
			displayName: "",
		});
	});

	it("is clean immediately after opening the panel to edit", () => {
		const draft = draftFromEnvironment({ id: "e1", name: "prod", displayName: "Production" });
		expect(isEnvironmentDraftDirty(draft, draft)).toBe(false);
	});
});

describe("isEnvironmentDraftDirty", () => {
	const baseline = { name: "prod", displayName: "Production" };

	it("is clean for an identical draft", () => {
		expect(isEnvironmentDraftDirty({ ...baseline }, baseline)).toBe(false);
	});

	it("ignores padding, since the service trims before storing", () => {
		expect(
			isEnvironmentDraftDirty({ name: "  prod  ", displayName: "  Production  " }, baseline)
		).toBe(false);
	});

	it("is dirty when the display name changes", () => {
		expect(isEnvironmentDraftDirty({ ...baseline, displayName: "Prod EU" }, baseline)).toBe(true);
	});

	it("is dirty when the display name is cleared", () => {
		expect(isEnvironmentDraftDirty({ ...baseline, displayName: "" }, baseline)).toBe(true);
	});

	it("is dirty when the identifier changes", () => {
		expect(isEnvironmentDraftDirty({ ...baseline, name: "prod-eu" }, baseline)).toBe(true);
	});

	it("treats a freshly opened create panel as clean", () => {
		expect(isEnvironmentDraftDirty(emptyEnvironmentDraft, emptyEnvironmentDraft)).toBe(false);
	});
});
