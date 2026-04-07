import { afterEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  exchangeToken: vi.fn(),
}));

vi.mock("../src/api.js", async () => {
  const actual = await vi.importActual<typeof import("../src/api.js")>("../src/api.js");

  return {
    ...actual,
    exchangeToken: apiMocks.exchangeToken,
  };
});

import { OAuthError } from "../src/api.js";
import { TokenManager } from "../src/tokens.js";

describe("TokenManager", () => {
  afterEach(() => {
    apiMocks.exchangeToken.mockReset();
    vi.restoreAllMocks();
  });

  it("returns the cached access token when it is still valid", async () => {
    const manager = new TokenManager({
      issuerUrl: "https://auth.example.com",
      clientId: "client-123",
      clientSecret: "secret-456",
      tokenEndpoint: "https://auth.example.com/oauth/token",
    });

    manager.setTokens({
      access_token: "cached-access-token",
      refresh_token: "refresh-token",
      token_type: "Bearer",
      expires_in: 3600,
    });

    await expect(manager.getAccessToken()).resolves.toBe("cached-access-token");
    expect(apiMocks.exchangeToken).not.toHaveBeenCalled();
  });

  it("refreshes tokens when the access token is expired or near expiry", async () => {
    const manager = new TokenManager({
      issuerUrl: "https://auth.example.com",
      clientId: "client-123",
      clientSecret: "secret-456",
      tokenEndpoint: "https://auth.example.com/oauth/token",
    });
    apiMocks.exchangeToken.mockResolvedValue({
      access_token: "fresh-access-token",
      refresh_token: "fresh-refresh-token",
      token_type: "Bearer",
      expires_in: 3600,
    });

    manager.setTokens({
      access_token: "stale-access-token",
      refresh_token: "refresh-token",
      token_type: "Bearer",
      expires_in: 1,
    });

    await expect(manager.getAccessToken()).resolves.toBe("fresh-access-token");
    expect(apiMocks.exchangeToken).toHaveBeenCalledWith(
      {
        grantType: "refresh_token",
        clientId: "client-123",
        clientSecret: "secret-456",
        refreshToken: "refresh-token",
      },
      { tokenEndpoint: "https://auth.example.com/oauth/token" }
    );
  });

  it("throws a no_token OAuthError when no token state is available", async () => {
    const manager = new TokenManager({
      issuerUrl: "https://auth.example.com",
      clientId: "client-123",
      clientSecret: "secret-456",
      tokenEndpoint: "https://auth.example.com/oauth/token",
    });

    await expect(manager.getAccessToken()).rejects.toEqual(
      expect.objectContaining<Partial<OAuthError>>({
        name: "OAuthError",
        code: "no_token",
        message:
          "No valid access token available. Call setTokens() first or perform an initial token exchange.",
      })
    );
  });
});