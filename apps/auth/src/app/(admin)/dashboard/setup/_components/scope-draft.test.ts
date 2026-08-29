import { describe, expect, it } from "vitest";
import { draftFromScope, emptyScopeDraft, isScopeDraftDirty } from "./scope-draft";

describe("draftFromScope", () => {
	it("maps null consent copy to blank fields", () => {
		expect(
			draftFromScope({ id: "s1", scopeName: "email", displayName: null, description: null })
		).toEqual({ scopeName: "email", displayName: "", description: "" });
	});

	it("is clean immediately after opening the panel to edit", () => {
		const draft = draftFromScope({
			id: "s1",
			scopeName: "email",
			displayName: "Your email address",
			description: "See your email address.",
		});
		expect(isScopeDraftDirty(draft, draft)).toBe(false);
	});
});

describe("isScopeDraftDirty", () => {
	const baseline = {
		scopeName: "email",
		displayName: "Your email address",
		description: "See your email address.",
	};

	it("is clean for an identical draft", () => {
		expect(isScopeDraftDirty({ ...baseline }, baseline)).toBe(false);
	});

	it("ignores padding, since the service trims before storing", () => {
		expect(
			isScopeDraftDirty(
				{
					scopeName: "  email  ",
					displayName: "  Your email address  ",
					description: "  See your email address.  ",
				},
				baseline
			)
		).toBe(false);
	});

	it("is dirty when the consent label changes", () => {
		expect(isScopeDraftDirty({ ...baseline, displayName: "Email" }, baseline)).toBe(true);
	});

	it("is dirty when the description is cleared", () => {
		expect(isScopeDraftDirty({ ...baseline, description: "" }, baseline)).toBe(true);
	});

	it("treats a freshly opened create panel as clean", () => {
		expect(isScopeDraftDirty(emptyScopeDraft, emptyScopeDraft)).toBe(false);
	});
});
