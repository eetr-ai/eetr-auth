import { afterEach, describe, expect, it, vi } from "vitest";

const joseMocks = vi.hoisted(() => ({
  createRemoteJWKSet: vi.fn(),
  jwtVerify: vi.fn(),
}));

vi.mock("jose", () => joseMocks);

import { decodeJwtPayload, validateIdToken, validateJwt } from "../src/jwt.js";

describe("validateJwt", () => {
  afterEach(() => {
    joseMocks.createRemoteJWKSet.mockReset();
    joseMocks.jwtVerify.mockReset();
  });

  it("caches the remote JWKS loader per uri and forwards verification options", async () => {
    const jwks = Symbol("jwks-loader");
    joseMocks.createRemoteJWKSet.mockReturnValue(jwks);
    joseMocks.jwtVerify
      .mockResolvedValueOnce({ payload: { sub: "user-123" } })
      .mockResolvedValueOnce({ payload: { sub: "user-456" } });

    const first = await validateJwt(
      "token-one",
      "https://auth.example.com/.well-known/jwks.json",
      {
        audience: ["client-app"],
        issuer: "https://auth.example.com",
      }
    );
    const second = await validateJwt(
      "token-two",
      "https://auth.example.com/.well-known/jwks.json"
    );

    expect(first).toEqual({ sub: "user-123" });
    expect(second).toEqual({ sub: "user-456" });
    expect(joseMocks.createRemoteJWKSet).toHaveBeenCalledTimes(1);
    expect(joseMocks.createRemoteJWKSet).toHaveBeenCalledWith(
      new URL("https://auth.example.com/.well-known/jwks.json")
    );
    expect(joseMocks.jwtVerify).toHaveBeenNthCalledWith(1, "token-one", jwks, {
      audience: ["client-app"],
      issuer: "https://auth.example.com",
      clockTolerance: 5,
    });
    expect(joseMocks.jwtVerify).toHaveBeenNthCalledWith(2, "token-two", jwks, {
      audience: undefined,
      issuer: undefined,
      clockTolerance: 5,
    });
  });
});

describe("validateIdToken", () => {
  afterEach(() => {
    joseMocks.createRemoteJWKSet.mockReset();
    joseMocks.jwtVerify.mockReset();
  });

  it("verifies the token and returns claims when the nonce matches", async () => {
    joseMocks.createRemoteJWKSet.mockReturnValue(Symbol("jwks"));
    joseMocks.jwtVerify.mockResolvedValue({
      payload: { sub: "user-123", nonce: "n-0S6_WzA2Mj", email: "a@example.com" },
    });

    const claims = await validateIdToken(
      "id-token",
      "https://auth.example.com/jwks.json",
      { audience: "client-app", issuer: "https://auth.example.com", nonce: "n-0S6_WzA2Mj" }
    );

    expect(claims.sub).toBe("user-123");
    expect(claims.email).toBe("a@example.com");
    // The nonce option must not be forwarded to jose (it has no such verify option).
    expect(joseMocks.jwtVerify).toHaveBeenCalledWith("id-token", expect.anything(), {
      audience: "client-app",
      issuer: "https://auth.example.com",
      clockTolerance: 5,
    });
  });

  it("throws when the nonce does not match", async () => {
    joseMocks.createRemoteJWKSet.mockReturnValue(Symbol("jwks"));
    joseMocks.jwtVerify.mockResolvedValue({ payload: { sub: "user-123", nonce: "other" } });

    await expect(
      validateIdToken("id-token", "https://auth.example.com/jwks.json", {
        nonce: "expected",
      })
    ).rejects.toThrow("id_token nonce mismatch");
  });

  it("propagates signature/claim verification failures from jose", async () => {
    joseMocks.createRemoteJWKSet.mockReturnValue(Symbol("jwks"));
    joseMocks.jwtVerify.mockRejectedValue(new Error("unexpected \"aud\" claim value"));

    await expect(
      validateIdToken("id-token", "https://auth.example.com/jwks.json", {
        audience: "expected-client",
      })
    ).rejects.toThrow('unexpected "aud" claim value');
  });
});

describe("decodeJwtPayload", () => {
  it("decodes the jwt payload from a base64url encoded token", () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString(
      "base64url"
    );
    const payload = Buffer.from(
      JSON.stringify({ sub: "user-123", scope: "openid profile" })
    ).toString("base64url");
    const token = `${header}.${payload}.signature`;

    expect(decodeJwtPayload(token)).toEqual({
      sub: "user-123",
      scope: "openid profile",
    });
  });

  it("rejects tokens that do not contain three parts", () => {
    expect(() => decodeJwtPayload("not-a-jwt")).toThrow(
      "Invalid JWT format: expected 3 parts"
    );
  });
});