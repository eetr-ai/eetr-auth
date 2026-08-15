import { describe, expect, it } from "vitest";
import { buildUserInfoClaims, type UserInfoClaimsUser } from "./userinfo-claims";

const user: UserInfoClaimsUser = {
	id: "user-1",
	username: "alice",
	name: "Alice Example",
	email: "alice@example.com",
	emailVerifiedAt: "2026-01-01T00:00:00.000Z",
	avatarUrl: null,
};

describe("buildUserInfoClaims", () => {
	it("returns only sub when no profile/email scopes are granted", () => {
		const claims = buildUserInfoClaims(user, ["openid"]);
		expect(claims).toEqual({ sub: "user-1" });
	});

	it("includes profile claims only when the profile scope is granted", () => {
		const claims = buildUserInfoClaims(user, ["openid", "profile"]);
		expect(claims).toMatchObject({
			sub: "user-1",
			name: "Alice Example",
			preferred_username: "alice",
		});
		expect("picture" in claims).toBe(true); // present (null when no avatar)
		expect("email" in claims).toBe(false);
		expect("email_verified" in claims).toBe(false);
	});

	it("passes through the avatar URL resolved by UserService", () => {
		// The URL is built against the site's CDN setting upstream; rebuilding it
		// here from the environment is what made avatars ignore that setting.
		const claims = buildUserInfoClaims(
			{ ...user, avatarUrl: "https://cdn.example.com/avatars/user-1.png" },
			["profile"],
		);
		expect(claims.picture).toBe("https://cdn.example.com/avatars/user-1.png");
	});

	it("includes email claims only when the email scope is granted", () => {
		const claims = buildUserInfoClaims(user, ["openid", "email"]);
		expect(claims).toMatchObject({
			sub: "user-1",
			email: "alice@example.com",
			email_verified: true,
		});
		expect("name" in claims).toBe(false);
		expect("preferred_username" in claims).toBe(false);
	});

	it("includes both claim sets when both scopes are granted", () => {
		const claims = buildUserInfoClaims(user, ["openid", "profile", "email"]);
		expect(claims).toMatchObject({
			sub: "user-1",
			name: "Alice Example",
			preferred_username: "alice",
			email: "alice@example.com",
			email_verified: true,
		});
	});

	it("falls back to the username for name and reports email_verified=false when unverified", () => {
		const claims = buildUserInfoClaims({ ...user, name: null, emailVerifiedAt: null }, [
			"profile",
			"email",
		]);
		expect(claims.name).toBe("alice");
		expect(claims.email_verified).toBe(false);
	});
});
