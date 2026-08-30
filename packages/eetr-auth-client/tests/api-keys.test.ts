import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createClientApiKey,
  listClientApiKeys,
  revokeClientApiKey,
} from "../src/admin.js";
import { OAuthError, exchangeApiKey } from "../src/api.js";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

const config = { baseUrl: "https://auth.example.com/", accessToken: "admin-token" };

const apiKeyRecord = {
  keyId: "3f2a9c1b4d5e6f70",
  name: "deploy",
  userId: "user-1",
  username: "ci-bot",
  createdBy: "admin",
  createdAt: "2026-04-01T00:00:00.000Z",
  expiresAt: null,
  revokedAt: null,
  lastUsedAt: null,
};

describe("listClientApiKeys", () => {
  afterEach(() => vi.restoreAllMocks());

  it("GETs the collection with a bearer token and unwraps the array", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ apiKeys: [apiKeyRecord] }));

    const result = await listClientApiKeys("cli_abc", config);

    expect(result).toEqual([apiKeyRecord]);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    // Trailing slash on baseUrl is normalized away.
    expect(url).toBe("https://auth.example.com/api/admin/clients/cli_abc/api-keys");
    expect(init).toMatchObject({ headers: { Authorization: "Bearer admin-token" } });
  });

  it("percent-encodes the client id", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ apiKeys: [] }));

    await listClientApiKeys("cli/abc?x=1", config);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://auth.example.com/api/admin/clients/cli%2Fabc%3Fx%3D1/api-keys"
    );
  });

  it("throws an OAuthError on a non-2xx response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(
        { error: "not_found", error_description: "Client not found" },
        { status: 404 }
      )
    );

    await expect(listClientApiKeys("cli_abc", config)).rejects.toBeInstanceOf(OAuthError);
  });
});

describe("createClientApiKey", () => {
  afterEach(() => vi.restoreAllMocks());

  it("omits userId entirely when self-service should infer it from the token", async () => {
    const created = { ...apiKeyRecord, apiKey: "eak_3f2a9c1b4d5e6f70_deadbeef" };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(created, { status: 201 }));

    await createClientApiKey("cli_abc", { name: "deploy" }, config);

    // Sending `userId: undefined` would serialize the key away anyway, but an explicit
    // `null` would reach the server as a bad reference — so assert the field is absent.
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).not.toHaveProperty("userId");
    expect(body).toEqual({ name: "deploy" });
  });

  it("POSTs the binding and returns the one-time credential", async () => {
    const created = { ...apiKeyRecord, apiKey: "eak_3f2a9c1b4d5e6f70_deadbeef" };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(created, { status: 201 }));

    const result = await createClientApiKey(
      "cli_abc",
      { userId: "ci-bot", name: "deploy", scopes: ["read"] },
      config
    );

    expect(result.apiKey).toBe("eak_3f2a9c1b4d5e6f70_deadbeef");
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://auth.example.com/api/admin/clients/cli_abc/api-keys");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        Authorization: "Bearer admin-token",
        "Content-Type": "application/json",
      },
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      userId: "ci-bot",
      name: "deploy",
      scopes: ["read"],
    });
  });

  it("omits optional fields entirely rather than sending nulls", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ ...apiKeyRecord, apiKey: "eak_a_b" }, { status: 201 }));

    await createClientApiKey("cli_abc", { userId: "ci-bot" }, config);

    // An omitted `scopes` means "all the client's scopes"; sending an empty array would
    // read as the same thing but is not what the caller asked for.
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      userId: "ci-bot",
    });
  });

  it("forwards an explicit null expiry, which means never expires", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ ...apiKeyRecord, apiKey: "eak_a_b" }, { status: 201 }));

    await createClientApiKey("cli_abc", { userId: "ci-bot", expiresAt: null }, config);

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      userId: "ci-bot",
      expiresAt: null,
    });
  });

  it("throws an OAuthError when a scope is not granted to the client", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(
        { error: "invalid_request", error_description: "Scope not granted to this client: admin" },
        { status: 400 }
      )
    );

    await expect(
      createClientApiKey("cli_abc", { userId: "ci-bot", scopes: ["admin"] }, config)
    ).rejects.toBeInstanceOf(OAuthError);
  });
});

describe("revokeClientApiKey", () => {
  afterEach(() => vi.restoreAllMocks());

  it("DELETEs the key by its public handle", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ ok: true }));

    const result = await revokeClientApiKey("cli_abc", "3f2a9c1b4d5e6f70", config);

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://auth.example.com/api/admin/clients/cli_abc/api-keys/3f2a9c1b4d5e6f70"
    );
    expect(init).toMatchObject({
      method: "DELETE",
      headers: { Authorization: "Bearer admin-token" },
    });
  });

  it("percent-encodes both path segments", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ ok: true }));

    await revokeClientApiKey("cli/abc", "key/id", config);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://auth.example.com/api/admin/clients/cli%2Fabc/api-keys/key%2Fid"
    );
  });

  it("throws an OAuthError for an unknown key", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ error: "not_found", error_description: "API key not found" }, { status: 404 })
    );

    await expect(revokeClientApiKey("cli_abc", "nope", config)).rejects.toBeInstanceOf(OAuthError);
  });
});

describe("exchangeApiKey", () => {
  afterEach(() => vi.restoreAllMocks());

  const endpointConfig = { apiKeyEndpoint: "https://auth.example.com/api/token/api-key" };

  it("sends the key as a bearer credential, keeping it out of the body", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ token_type: "Bearer", access_token: "jwt-here", expires_in: 3600 })
    );

    const result = await exchangeApiKey({ apiKey: "eak_a_b" }, endpointConfig);

    expect(result.access_token).toBe("jwt-here");
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://auth.example.com/api/token/api-key");
    expect(init).toMatchObject({
      method: "POST",
      headers: { Authorization: "Bearer eak_a_b" },
    });
    expect(String(init?.body)).not.toContain("eak_a_b");
  });

  it("sends a narrowing scope, from either the string or the array form", async () => {
    // A Response body can only be read once, and this test makes two calls.
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () =>
        jsonResponse({ token_type: "Bearer", access_token: "jwt", expires_in: 3600 })
      );

    await exchangeApiKey({ apiKey: "eak_a_b", scopes: ["read", "write"] }, endpointConfig);
    expect(new URLSearchParams(String(fetchMock.mock.calls[0]?.[1]?.body)).get("scope")).toBe(
      "read write"
    );

    await exchangeApiKey({ apiKey: "eak_a_b", scope: "read" }, endpointConfig);
    expect(new URLSearchParams(String(fetchMock.mock.calls[1]?.[1]?.body)).get("scope")).toBe(
      "read"
    );
  });

  it("forwards an RFC 8707 resource indicator", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ token_type: "Bearer", access_token: "jwt", expires_in: 3600 })
    );

    await exchangeApiKey(
      { apiKey: "eak_a_b", resource: "https://api.example.com" },
      endpointConfig
    );

    expect(new URLSearchParams(String(fetchMock.mock.calls[0]?.[1]?.body)).get("resource")).toBe(
      "https://api.example.com"
    );
  });

  it("throws an OAuthError carrying the server's code for an invalid key", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(
        { error: "invalid_client", error_description: "Invalid API key." },
        { status: 401 }
      )
    );

    const error = await exchangeApiKey({ apiKey: "eak_bad" }, endpointConfig).catch(
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(OAuthError);
    // status and description are carried through, so a caller can distinguish a bad key
    // (401) from a bad scope (400) without parsing the message.
    expect(error).toMatchObject({
      code: "invalid_client",
      status: 401,
      description: "Invalid API key.",
    });
  });
});
