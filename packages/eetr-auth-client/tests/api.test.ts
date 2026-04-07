import { afterEach, describe, expect, it, vi } from "vitest";

import {
  exchangeToken,
  getUserInfo,
  introspectToken,
  OAuthError,
} from "../src/api.js";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("exchangeToken", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts a form-encoded token request and returns the token response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        access_token: "access-token",
        refresh_token: "refresh-token",
        token_type: "Bearer",
        expires_in: 3600,
      })
    );

    const result = await exchangeToken(
      {
        grantType: "authorization_code",
        clientId: "client-123",
        clientSecret: "secret-456",
        scope: "openid profile",
        code: "code-789",
        redirectUri: "https://client.example.com/callback",
        codeVerifier: "verifier-101112",
      },
      { tokenEndpoint: "https://auth.example.com/oauth/token" }
    );

    expect(result).toEqual({
      access_token: "access-token",
      refresh_token: "refresh-token",
      token_type: "Bearer",
      expires_in: 3600,
    });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://auth.example.com/oauth/token");
    expect(init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(init?.body).toBeInstanceOf(URLSearchParams);
    expect((init?.body as URLSearchParams).toString()).toBe(
      "grant_type=authorization_code&client_id=client-123&client_secret=secret-456&scope=openid+profile&code=code-789&redirect_uri=https%3A%2F%2Fclient.example.com%2Fcallback&code_verifier=verifier-101112"
    );
  });

  it("throws an OAuthError when the token endpoint responds with an error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(
        {
          error: "invalid_grant",
          error_description: "Authorization code is invalid",
        },
        { status: 400, statusText: "Bad Request" }
      )
    );

    await expect(
      exchangeToken(
        {
          grantType: "authorization_code",
          clientId: "client-123",
          code: "bad-code",
        },
        { tokenEndpoint: "https://auth.example.com/oauth/token" }
      )
    ).rejects.toEqual(
      expect.objectContaining<Partial<OAuthError>>({
        name: "OAuthError",
        code: "invalid_grant",
        message: "Authorization code is invalid",
      })
    );
  });
});

describe("introspectToken", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts the token validation payload as json", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        valid: true,
        active: true,
        client_id: "client-123",
        expires_at: "2026-04-06T12:00:00.000Z",
      })
    );

    const result = await introspectToken(
      {
        token: "opaque-token",
        scopes: ["openid", "profile"],
        environmentName: "production",
      },
      { introspectionEndpoint: "https://auth.example.com/oauth/introspect" }
    );

    expect(result).toEqual({
      valid: true,
      active: true,
      client_id: "client-123",
      expires_at: "2026-04-06T12:00:00.000Z",
    });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://auth.example.com/oauth/introspect");
    expect(init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "opaque-token",
        scopes: ["openid", "profile"],
        environmentName: "production",
      }),
    });
  });
});

describe("getUserInfo", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends the access token as a bearer token and returns the profile", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        sub: "user-123",
        email: "user@example.com",
        email_verified: true,
      })
    );

    const result = await getUserInfo(
      "access-token",
      "https://auth.example.com/oauth/userinfo"
    );

    expect(result).toEqual({
      sub: "user-123",
      email: "user@example.com",
      email_verified: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://auth.example.com/oauth/userinfo",
      {
        headers: { Authorization: "Bearer access-token" },
      }
    );
  });

  it("falls back to invalid_token when the userinfo error body is not json", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not-json", { status: 401, statusText: "Unauthorized" })
    );

    await expect(
      getUserInfo("access-token", "https://auth.example.com/oauth/userinfo")
    ).rejects.toEqual(
      expect.objectContaining<Partial<OAuthError>>({
        name: "OAuthError",
        code: "invalid_token",
        message: "UserInfo request failed: 401",
      })
    );
  });
});