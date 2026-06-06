import { describe, expect, it } from "vitest";

import {
  OIDCScope,
  STANDARD_OIDC_SCOPES,
  resolveScopeParam,
} from "../src/scopes.js";

describe("OIDCScope constants", () => {
  it("exposes the standard OIDC scope names", () => {
    expect(OIDCScope.OpenId).toBe("openid");
    expect(OIDCScope.Profile).toBe("profile");
    expect(OIDCScope.Email).toBe("email");
  });

  it("STANDARD_OIDC_SCOPES is openid/profile/email in canonical order", () => {
    expect(STANDARD_OIDC_SCOPES).toEqual(["openid", "profile", "email"]);
  });
});

describe("resolveScopeParam", () => {
  it("returns undefined when nothing meaningful is provided", () => {
    expect(resolveScopeParam()).toBeUndefined();
    expect(resolveScopeParam("", [])).toBeUndefined();
    expect(resolveScopeParam("   ", ["  "])).toBeUndefined();
  });

  it("passes a plain scope string through", () => {
    expect(resolveScopeParam("openid profile")).toBe("openid profile");
  });

  it("joins a scopes array into a space-delimited string", () => {
    expect(resolveScopeParam(undefined, [OIDCScope.OpenId, OIDCScope.Profile, OIDCScope.Email])).toBe(
      "openid profile email"
    );
  });

  it("merges the scope string and scopes array, de-duped and order-preserving", () => {
    expect(resolveScopeParam("openid profile", ["profile", "email"])).toBe(
      "openid profile email"
    );
  });

  it("trims whitespace and ignores blank entries", () => {
    expect(resolveScopeParam("  openid   profile  ", ["", "  email  "])).toBe(
      "openid profile email"
    );
  });
});
