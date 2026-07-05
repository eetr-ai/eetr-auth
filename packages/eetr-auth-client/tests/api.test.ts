import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildAuthorizationUrl,
  exchangeToken,
  getUserInfo,
  introspectToken,
  registerClient,
  OAuthError,
} from "../src/api.js";
import { OIDCScope } from "../src/scopes.js";

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

  it("includes the RFC 8707 resource parameter when provided", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ access_token: "at", token_type: "Bearer" })
    );

    await exchangeToken(
      {
        grantType: "authorization_code",
        clientId: "client-123",
        code: "code-789",
        codeVerifier: "verifier",
        redirectUri: "https://app.example.com/cb",
        resource: "https://mcp.example.com/mcp",
      },
      { tokenEndpoint: "https://auth.example.com/oauth/token" }
    );

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect((init?.body as URLSearchParams).get("resource")).toBe("https://mcp.example.com/mcp");
  });

  it("merges a scopes array into the scope param", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ access_token: "at", token_type: "Bearer" })
    );

    await exchangeToken(
      {
        grantType: "client_credentials",
        clientId: "client-123",
        clientSecret: "secret",
        scope: "openid",
        scopes: [OIDCScope.OpenId, OIDCScope.Profile, OIDCScope.Email],
      },
      { tokenEndpoint: "https://auth.example.com/oauth/token" }
    );

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect((init?.body as URLSearchParams).toString()).toContain(
      "scope=openid+profile+email"
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

  it("surfaces a 403 as insufficient_scope with status and hint", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(
        {
          error: "insufficient_scope",
          error_description: "The openid scope is required.",
        },
        { status: 403, statusText: "Forbidden" }
      )
    );

    const err = (await getUserInfo(
      "access-token",
      "https://auth.example.com/oauth/userinfo"
    ).catch((e) => e)) as OAuthError;

    expect(err).toBeInstanceOf(OAuthError);
    expect(err.code).toBe("insufficient_scope");
    expect(err.status).toBe(403);
    expect(err.isInsufficientScope).toBe(true);
    expect(err.message).toBe("The openid scope is required.");
  });

  it("defaults a 403 with no body to insufficient_scope", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not-json", { status: 403, statusText: "Forbidden" })
    );

    const err = (await getUserInfo(
      "access-token",
      "https://auth.example.com/oauth/userinfo"
    ).catch((e) => e)) as OAuthError;

    expect(err.code).toBe("insufficient_scope");
    expect(err.isInsufficientScope).toBe(true);
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
describe("buildAuthorizationUrl", () => {
  it("builds a PKCE authorization URL including the OIDC nonce", () => {
    const url = new URL(
      buildAuthorizationUrl("https://auth.example.com/api/authorize", {
        clientId: "client-app",
        redirectUri: "https://app.example.com/callback",
        codeChallenge: "s256-challenge",
        scope: "openid profile email",
        state: "state-123",
        nonce: "n-0S6_WzA2Mj",
      })
    );

    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("client-app");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.example.com/callback"
    );
    expect(url.searchParams.get("code_challenge")).toBe("s256-challenge");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe("openid profile email");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("nonce")).toBe("n-0S6_WzA2Mj");
  });

  it("accepts a scopes array and merges/dedupes it with the scope string", () => {
    const url = new URL(
      buildAuthorizationUrl("https://auth.example.com/api/authorize", {
        clientId: "client-app",
        redirectUri: "https://app.example.com/callback",
        codeChallenge: "s256-challenge",
        scope: "openid",
        scopes: [OIDCScope.OpenId, OIDCScope.Profile, OIDCScope.Email],
      })
    );

    expect(url.searchParams.get("scope")).toBe("openid profile email");
  });

  it("omits optional params when not provided", () => {
    const url = new URL(
      buildAuthorizationUrl("https://auth.example.com/api/authorize", {
        clientId: "client-app",
        redirectUri: "https://app.example.com/callback",
        codeChallenge: "s256-challenge",
      })
    );

    expect(url.searchParams.has("scope")).toBe(false);
    expect(url.searchParams.has("state")).toBe(false);
    expect(url.searchParams.has("nonce")).toBe(false);
    expect(url.searchParams.has("resource")).toBe(false);
  });

  it("includes the RFC 8707 resource parameter when provided", () => {
    const url = new URL(
      buildAuthorizationUrl("https://auth.example.com/api/authorize", {
        clientId: "client-app",
        redirectUri: "https://app.example.com/callback",
        codeChallenge: "s256-challenge",
        resource: "https://mcp.example.com/mcp",
      })
    );

    expect(url.searchParams.get("resource")).toBe("https://mcp.example.com/mcp");
  });
});

describe("registerClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts an RFC 7591 registration and returns the created client", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(
        {
          client_id: "mcp_abc123",
          client_id_issued_at: 1_700_000_000,
          redirect_uris: ["https://claude.ai/cb"],
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
          scope: "openid profile",
        },
        { status: 201 }
      )
    );

    const result = await registerClient(
      {
        clientName: "Test MCP",
        redirectUris: ["https://claude.ai/cb"],
        tokenEndpointAuthMethod: "none",
        scopes: [OIDCScope.OpenId, OIDCScope.Profile],
      },
      { registrationEndpoint: "https://auth.example.com/api/register" }
    );

    expect(result.client_id).toBe("mcp_abc123");
    expect(result.client_secret).toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://auth.example.com/api/register");
    expect(init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(JSON.parse(init?.body as string)).toEqual({
      redirect_uris: ["https://claude.ai/cb"],
      client_name: "Test MCP",
      token_endpoint_auth_method: "none",
      scope: "openid profile",
    });
  });

  it("throws an OAuthError with status when registration is rejected", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(
        { error: "invalid_redirect_uri", error_description: "Invalid redirect_uri." },
        { status: 400, statusText: "Bad Request" }
      )
    );

    const err = (await registerClient(
      { redirectUris: ["http://evil.example.com/cb"] },
      { registrationEndpoint: "https://auth.example.com/api/register" }
    ).catch((e) => e)) as OAuthError;

    expect(err).toBeInstanceOf(OAuthError);
    expect(err.code).toBe("invalid_redirect_uri");
    expect(err.status).toBe(400);
  });
});
