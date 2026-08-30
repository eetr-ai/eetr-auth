import { describe, expect, it } from "vitest";

import { decideSelfServiceAccess } from "./self-service-access";

/** The happy path; each test below breaks exactly one condition. */
const ALLOWED = {
	enabled: true,
	targetClientRowId: "client-row-1",
	tokenClientRowId: "client-row-1",
	subject: "user-1",
	apiKeyId: null,
};

const NOT_ADMIN = "Token client is not configured as an admin API client.";

describe("decideSelfServiceAccess", () => {
	it("allows a user-scoped token issued by the client in the path", () => {
		expect(decideSelfServiceAccess(ALLOWED)).toEqual({ allowed: true, userId: "user-1" });
	});

	it("denies every non-admin caller on a route that did not opt in", () => {
		expect(decideSelfServiceAccess({ ...ALLOWED, enabled: false })).toEqual({
			allowed: false,
			description: NOT_ADMIN,
		});
	});

	it("denies a token issued by a different client than the one in the path", () => {
		// Otherwise knowing another client's public client_id would be enough to manage
		// its API keys.
		expect(
			decideSelfServiceAccess({ ...ALLOWED, tokenClientRowId: "client-row-2" })
		).toEqual({ allowed: false, description: NOT_ADMIN });
	});

	it("denies when the path client does not resolve", () => {
		expect(decideSelfServiceAccess({ ...ALLOWED, targetClientRowId: null })).toEqual({
			allowed: false,
			description: NOT_ADMIN,
		});
	});

	it("reuses the generic denial so it cannot be probed for admin clients", () => {
		// A distinct message for "right client, wrong privileges" would turn 403 bodies into
		// an oracle for which clients are configured as admin API clients.
		const wrongClient = decideSelfServiceAccess({ ...ALLOWED, tokenClientRowId: "other" });
		const notEnabled = decideSelfServiceAccess({ ...ALLOWED, enabled: false });
		expect(wrongClient).toEqual(notEnabled);
	});

	it("denies a client_credentials token, which has no user to confine to", () => {
		const decision = decideSelfServiceAccess({ ...ALLOWED, subject: null });
		expect(decision.allowed).toBe(false);
		expect(decision).toMatchObject({ description: expect.stringContaining("user-scoped") });
	});

	it("denies a token that an API key minted, so a key cannot issue its own successor", () => {
		// The escalation this blocks: a key expiring next week and narrowed to `read`
		// exchanges itself for a token, then uses it to create a never-expiring key holding
		// every scope the client has.
		const decision = decideSelfServiceAccess({ ...ALLOWED, apiKeyId: "key-row-1" });
		expect(decision.allowed).toBe(false);
		expect(decision).toMatchObject({
			description: expect.stringContaining("minted from an API key"),
		});
	});
});
