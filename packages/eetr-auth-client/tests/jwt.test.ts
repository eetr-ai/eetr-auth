import { afterEach, describe, expect, it, vi } from "vitest";

const joseMocks = vi.hoisted(() => ({
  createRemoteJWKSet: vi.fn(),
  jwtVerify: vi.fn(),
}));

vi.mock("jose", () => joseMocks);

import { decodeJwtPayload, validateJwt } from "../src/jwt.js";

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