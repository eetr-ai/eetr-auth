import { afterEach, describe, expect, it, vi } from "vitest";

import { listPasskeys, removePasskey, renamePasskey } from "../src/passkeys.js";
import { OAuthError } from "../src/api.js";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

const config = { baseUrl: "https://auth.example.com/", accessToken: "user-token" };

describe("listPasskeys", () => {
  afterEach(() => vi.restoreAllMocks());

  it("GETs the collection with a bearer token and unwraps the array", async () => {
    const summaries = [
      {
        id: "row-1",
        name: "iPhone",
        synced: true,
        deviceBound: false,
        createdAt: "2026-04-01T00:00:00.000Z",
        lastUsedAt: "2026-05-01T00:00:00.000Z",
      },
    ];
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ passkeys: summaries }));

    const result = await listPasskeys(config);

    expect(result).toEqual(summaries);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    // Trailing slash on baseUrl is normalized away.
    expect(url).toBe("https://auth.example.com/api/users/passkey");
    expect(init).toMatchObject({ headers: { Authorization: "Bearer user-token" } });
  });

  it("throws OAuthError on a non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ error: "unauthorized", error_description: "nope" }, { status: 401 })
    );
    await expect(listPasskeys(config)).rejects.toBeInstanceOf(OAuthError);
  });
});

describe("renamePasskey", () => {
  afterEach(() => vi.restoreAllMocks());

  it("PATCHes the resource with the new name", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ ok: true }));

    await renamePasskey("row 1", "My laptop", config);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://auth.example.com/api/users/passkey/row%201");
    expect(init).toMatchObject({
      method: "PATCH",
      headers: { Authorization: "Bearer user-token", "Content-Type": "application/json" },
    });
    expect(JSON.parse(String(init?.body))).toEqual({ name: "My laptop" });
  });

  it("throws not_found OAuthError when the passkey is not owned", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ error: "not_found", error_description: "Passkey not found." }, { status: 404 })
    );
    await expect(renamePasskey("row-x", "x", config)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("removePasskey", () => {
  afterEach(() => vi.restoreAllMocks());

  it("DELETEs the resource", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ ok: true }));

    await removePasskey("row-1", config);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://auth.example.com/api/users/passkey/row-1");
    expect(init).toMatchObject({
      method: "DELETE",
      headers: { Authorization: "Bearer user-token" },
    });
  });

  it("throws OAuthError on a non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ error: "server_error", error_description: "boom" }, { status: 500 })
    );
    await expect(removePasskey("row-1", config)).rejects.toBeInstanceOf(OAuthError);
  });
});
