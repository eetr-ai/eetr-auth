import { describe, expect, it } from "vitest";

import { toUserProfile } from "../src/profile.js";

describe("toUserProfile", () => {
  it("maps userinfo claims to a camelCased profile", () => {
    expect(
      toUserProfile({
        sub: "user-1",
        name: "Ada",
        preferred_username: "ada",
        picture: "https://cdn.example.com/ada.png",
        email: "ada@example.com",
        email_verified: true,
      })
    ).toEqual({
      sub: "user-1",
      name: "Ada",
      preferredUsername: "ada",
      picture: "https://cdn.example.com/ada.png",
      email: "ada@example.com",
      emailVerified: true,
    });
  });

  it("returns just sub for an openid-only token (no profile/email scopes)", () => {
    expect(toUserProfile({ sub: "user-1" })).toEqual({ sub: "user-1" });
  });

  it("fills gaps from id_token claims when userinfo omits them", () => {
    expect(
      toUserProfile(
        { sub: "user-1", email: "ada@example.com", email_verified: true },
        { sub: "user-1", name: "Ada Lovelace", preferred_username: "ada" }
      )
    ).toEqual({
      sub: "user-1",
      name: "Ada Lovelace",
      preferredUsername: "ada",
      email: "ada@example.com",
      emailVerified: true,
    });
  });

  it("prefers userinfo over id_token when both supply the same claim", () => {
    expect(
      toUserProfile(
        { sub: "user-1", name: "From UserInfo" },
        { sub: "user-1", name: "From IdToken" }
      ).name
    ).toBe("From UserInfo");
  });
});
