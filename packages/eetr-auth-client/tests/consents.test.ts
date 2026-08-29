import { afterEach, describe, expect, it, vi } from "vitest";

import { listUserConsents, revokeUserConsent } from "../src/admin.js";
import { OAuthError } from "../src/api.js";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

const config = { baseUrl: "https://auth.example.com/", accessToken: "admin-token" };

describe("listUserConsents", () => {
  afterEach(() => vi.restoreAllMocks());

  it("GETs the collection with a bearer token and unwraps the array", async () => {
    const consents = [
      {
        clientId: "cli_abc",
        clientName: "Reports",
        scopes: ["openid", "email"],
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z",
      },
    ];
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ consents }));

    const result = await listUserConsents("alice", config);

    expect(result).toEqual(consents);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    // Trailing slash on baseUrl is normalized away.
    expect(url).toBe("https://auth.example.com/api/admin/users/alice/consents");
    expect(init).toMatchObject({ headers: { Authorization: "Bearer admin-token" } });
  });

  it("percent-encodes the user segment", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ consents: [] }));

    await listUserConsents("a b/c", config);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://auth.example.com/api/admin/users/a%20b%2Fc/consents"
    );
  });

  it("throws OAuthError on a non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ error: "not_found", error_description: "User not found" }, { status: 404 })
    );

    await expect(listUserConsents("nobody", config)).rejects.toBeInstanceOf(OAuthError);
  });
});

describe("revokeUserConsent", () => {
  afterEach(() => vi.restoreAllMocks());

  it("DELETEs with the client_id as a query parameter", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ ok: true, accessTokensExpired: 2, codesDeleted: 1 }));

    const result = await revokeUserConsent("alice", "cli_abc", config);

    expect(result).toEqual({ ok: true, accessTokensExpired: 2, codesDeleted: 1 });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://auth.example.com/api/admin/users/alice/consents?client_id=cli_abc"
    );
    expect(init).toMatchObject({
      method: "DELETE",
      headers: { Authorization: "Bearer admin-token" },
    });
  });

  it("throws OAuthError on a non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ error: "not_found", error_description: "Client not found" }, { status: 404 })
    );

    await expect(revokeUserConsent("alice", "missing", config)).rejects.toBeInstanceOf(OAuthError);
  });
});
