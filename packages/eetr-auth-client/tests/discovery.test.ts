import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchOAuthMetadata, fetchOIDCDiscovery } from "../src/discovery.js";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("fetchOIDCDiscovery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requests the standard OIDC discovery endpoint for an issuer", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        issuer: "https://auth.example.com",
        authorization_endpoint: "https://auth.example.com/oauth/authorize",
        token_endpoint: "https://auth.example.com/oauth/token",
        userinfo_endpoint: "https://auth.example.com/oauth/userinfo",
        jwks_uri: "https://auth.example.com/.well-known/jwks.json",
        response_types_supported: ["code"],
        scopes_supported: ["openid", "profile"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
        code_challenge_methods_supported: ["S256"],
      })
    );

    const result = await fetchOIDCDiscovery("https://auth.example.com/base-path");

    expect(result.issuer).toBe("https://auth.example.com");
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://auth.example.com/.well-known/openid-configuration"
    );
  });

  it("throws a descriptive error when the discovery request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 503, statusText: "Service Unavailable" })
    );

    await expect(fetchOIDCDiscovery("https://auth.example.com")).rejects.toThrow(
      "Failed to fetch OIDC discovery: 503 Service Unavailable"
    );
  });
});

describe("fetchOAuthMetadata", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requests the standard OAuth authorization server metadata endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        issuer: "https://auth.example.com",
        authorization_endpoint: "https://auth.example.com/oauth/authorize",
        token_endpoint: "https://auth.example.com/oauth/token",
        jwks_uri: "https://auth.example.com/.well-known/jwks.json",
        response_types_supported: ["code"],
        scopes_supported: ["openid", "profile"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
      })
    );

    const result = await fetchOAuthMetadata("https://auth.example.com/issuer");

    expect(result.issuer).toBe("https://auth.example.com");
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://auth.example.com/.well-known/oauth-authorization-server"
    );
  });

  it("throws a descriptive error when the metadata request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 500, statusText: "Internal Server Error" })
    );

    await expect(fetchOAuthMetadata("https://auth.example.com")).rejects.toThrow(
      "Failed to fetch OAuth metadata: 500 Internal Server Error"
    );
  });
});