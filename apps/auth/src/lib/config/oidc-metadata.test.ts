import { describe, expect, it } from "vitest";

import {
	OIDC_CLAIMS_SUPPORTED,
	RESPONSE_MODES_SUPPORTED,
	TOKEN_ENDPOINT_AUTH_METHODS_SUPPORTED,
} from "./oidc-metadata";

describe("OIDC discovery metadata", () => {
	it("advertises the standard id_token claims", () => {
		for (const claim of ["sub", "iss", "aud", "exp", "iat", "auth_time", "nonce", "at_hash"]) {
			expect(OIDC_CLAIMS_SUPPORTED).toContain(claim);
		}
	});

	it("advertises the scope-gated profile and email claims", () => {
		for (const claim of ["name", "preferred_username", "picture", "email", "email_verified"]) {
			expect(OIDC_CLAIMS_SUPPORTED).toContain(claim);
		}
	});

	it("advertises the implemented token-endpoint auth methods and response modes", () => {
		expect(TOKEN_ENDPOINT_AUTH_METHODS_SUPPORTED).toEqual([
			"client_secret_basic",
			"client_secret_post",
		]);
		expect(RESPONSE_MODES_SUPPORTED).toEqual(["query"]);
	});
});
