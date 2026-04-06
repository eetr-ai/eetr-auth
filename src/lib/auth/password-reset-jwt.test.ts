import { beforeAll, describe, expect, it } from "vitest";
import { SignJWT, exportJWK, exportPKCS8, generateKeyPair, importPKCS8 } from "jose";

import {
	PASSWORD_RESET_JWT_PURPOSE,
	signPasswordResetJwt,
	verifyPasswordResetJwt,
} from "@/lib/auth/password-reset-jwt";

describe("password reset JWT", () => {
	let env: Record<string, unknown>;
	let privateKeyPem: string;

	beforeAll(async () => {
		const { privateKey, publicKey } = await generateKeyPair("RS256", { extractable: true });
		privateKeyPem = await exportPKCS8(privateKey);
		const publicJwk = await exportJWK(publicKey);

		env = {
			ISSUER_BASE_URL: "https://auth.test.local",
			JWT_PRIVATE_KEY: privateKeyPem,
			JWT_KID: "test-kid",
			JWT_JWKS_JSON: JSON.stringify({
				keys: [{ ...publicJwk, kid: "test-kid" }],
			}),
		};
	});

	it("signs and verifies a password reset token round-trip", async () => {
		const token = await signPasswordResetJwt(env, {
			challengeId: "challenge-123",
			userId: "user-456",
			expiresAt: new Date(Date.now() + 5 * 60 * 1000),
		});

		await expect(verifyPasswordResetJwt(env, token)).resolves.toEqual({
			challengeId: "challenge-123",
			userId: "user-456",
		});
	});

	it("rejects an expired token", async () => {
		const token = await signPasswordResetJwt(env, {
			challengeId: "challenge-expired",
			userId: "user-expired",
			expiresAt: new Date(Date.now() - 60 * 1000),
		});

		await expect(verifyPasswordResetJwt(env, token)).rejects.toThrow();
	});

	it("rejects a token with the wrong purpose", async () => {
		const signingKey = await importPKCS8(privateKeyPem, "RS256");
		const token = await new SignJWT({ purpose: "not-password-reset" })
			.setProtectedHeader({ alg: "RS256", kid: "test-kid" })
			.setIssuer("https://auth.test.local")
			.setSubject("user-456")
			.setJti("challenge-123")
			.setIssuedAt(Math.floor(Date.now() / 1000))
			.setExpirationTime(Math.floor(Date.now() / 1000) + 300)
			.sign(signingKey);

		await expect(verifyPasswordResetJwt(env, token)).rejects.toThrow("Invalid token purpose.");
	});
});