import { describe, expect, it } from "vitest";
import { draftFromUser, emptyDraft, isUserDraftDirty, type UserDraft } from "./user-draft";
import type { UserRecord } from "@/lib/repositories/admin.repository";

const baseline: UserDraft = {
	...emptyDraft,
	username: "ada",
	name: "Ada Lovelace",
	email: "ada@example.com",
	environmentIds: ["env-a", "env-b"],
};

const withDraft = (patch: Partial<UserDraft>): UserDraft => ({ ...baseline, ...patch });

describe("isUserDraftDirty", () => {
	it("is clean for an identical draft", () => {
		expect(isUserDraftDirty(withDraft({}), baseline)).toBe(false);
	});

	it("ignores environment id ordering", () => {
		expect(isUserDraftDirty(withDraft({ environmentIds: ["env-b", "env-a"] }), baseline)).toBe(
			false,
		);
	});

	it("detects an environment change", () => {
		expect(isUserDraftDirty(withDraft({ environmentIds: ["env-a"] }), baseline)).toBe(true);
	});

	it("ignores surrounding whitespace in text fields", () => {
		expect(isUserDraftDirty(withDraft({ username: "  ada  ", name: " Ada Lovelace " }), baseline)).toBe(
			false,
		);
	});

	it("detects a real text change", () => {
		expect(isUserDraftDirty(withDraft({ email: "ada@other.example" }), baseline)).toBe(true);
	});

	it("treats any entered password as a change", () => {
		// Write-only: there is nothing to compare against, so non-empty means dirty.
		expect(isUserDraftDirty(withDraft({ password: "x" }), baseline)).toBe(true);
	});

	it("detects the admin flag flipping", () => {
		expect(isUserDraftDirty(withDraft({ isAdmin: false }), baseline)).toBe(true);
	});
});

describe("draftFromUser", () => {
	it("maps nulls to empty strings and never carries a password", () => {
		const user: UserRecord = {
			id: "u1",
			username: "ada",
			name: null,
			email: null,
			emailVerifiedAt: null,
			avatarKey: null,
			isAdmin: false,
			environmentIds: ["env-a"],
		};
		expect(draftFromUser(user)).toEqual({
			username: "ada",
			name: "",
			email: "",
			password: "",
			isAdmin: false,
			environmentIds: ["env-a"],
		});
	});

	it("copies environmentIds so editing the draft cannot mutate the record", () => {
		const user: UserRecord = {
			id: "u1",
			username: "ada",
			name: null,
			email: null,
			emailVerifiedAt: null,
			avatarKey: null,
			isAdmin: false,
			environmentIds: ["env-a"],
		};
		const draft = draftFromUser(user);
		draft.environmentIds.push("env-b");
		expect(user.environmentIds).toEqual(["env-a"]);
	});
});
