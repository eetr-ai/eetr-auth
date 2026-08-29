import { describe, expect, it } from "vitest";

import { getClientIdFromPath, toApiKeyPayload } from "./helpers";
import type { ApiKey } from "@/lib/repositories/api-key.repository";

describe("admin api-keys route helpers", () => {
	describe("getClientIdFromPath", () => {
		it("reads the client segment", () => {
			expect(getClientIdFromPath("/api/admin/clients/cid_abc/api-keys")).toBe("cid_abc");
		});

		it("decodes a percent-encoded client id", () => {
			expect(getClientIdFromPath("/api/admin/clients/cid%20abc/api-keys")).toBe("cid abc");
		});

		it("tolerates a trailing slash", () => {
			expect(getClientIdFromPath("/api/admin/clients/cid_abc/api-keys/")).toBe("cid_abc");
		});

		it.each([
			["too short", "/api/admin/clients"],
			["missing the api-keys segment", "/api/admin/clients/cid_abc"],
			["blank client id", "/api/admin/clients/%20/api-keys"],
		])("returns null when the path is %s", (_label, pathname) => {
			expect(getClientIdFromPath(pathname)).toBeNull();
		});
	});

	describe("toApiKeyPayload", () => {
		const apiKey: ApiKey = {
			id: "row-uuid-never-exposed",
			keyId: "3f2a9c1b4d5e6f70",
			clientId: "client-row-uuid-never-exposed",
			userId: "user-1",
			userDisplay: "ci-bot",
			name: "deploy",
			createdBy: "admin",
			createdAt: "2026-01-01T00:00:00.000Z",
			expiresAt: null,
			revokedAt: null,
			lastUsedAt: null,
		};

		it("exposes the public handle and the binding", () => {
			expect(toApiKeyPayload(apiKey)).toEqual({
				keyId: "3f2a9c1b4d5e6f70",
				name: "deploy",
				userId: "user-1",
				username: "ci-bot",
				createdBy: "admin",
				createdAt: "2026-01-01T00:00:00.000Z",
				expiresAt: null,
				revokedAt: null,
				lastUsedAt: null,
			});
		});

		it("never leaks internal row ids", () => {
			const payload = JSON.stringify(toApiKeyPayload(apiKey));
			expect(payload).not.toContain("row-uuid-never-exposed");
			expect(payload).not.toContain("client-row-uuid-never-exposed");
		});
	});
});
