import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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

	afterEach(() => {
		vi.unstubAllEnvs();
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

	it("throws when JWT_PRIVATE_KEY is not configured", async () => {
		await expect(
			signPasswordResetJwt(
				{ ISSUER_BASE_URL: "https://auth.test.local", JWT_KID: "test-kid" },
				{ challengeId: "c1", userId: "u1", expiresAt: new Date(Date.now() + 60000) }
			)
		).rejects.toThrow("JWT_PRIVATE_KEY is not configured.");
	});

	it("throws when JWKS is not available for verification", async () => {
		// Provide a valid token but no JWKS source
		const signingKey = await importPKCS8(privateKeyPem, "RS256");
		const token = await new SignJWT({ purpose: "password_reset" })
			.setProtectedHeader({ alg: "RS256", kid: "test-kid" })
			.setIssuer("https://auth.test.local")
			.setSubject("user-1")
			.setJti("c-1")
			.setIssuedAt()
			.setExpirationTime("1h")
			.sign(signingKey);

		await expect(
			verifyPasswordResetJwt({ ISSUER_BASE_URL: "https://auth.test.local" }, token)
		).rejects.toThrow("JWKS not available for password reset verification.");
	});

	it("throws when the token claims are invalid (empty sub or jti)", async () => {
		const signingKey = await importPKCS8(privateKeyPem, "RS256");
		// Token with empty subject — jti is also required
		const token = await new SignJWT({ purpose: "password_reset" })
			.setProtectedHeader({ alg: "RS256", kid: "test-kid" })
			.setIssuer("https://auth.test.local")
			.setSubject("")
			.setJti("")
			.setIssuedAt()
			.setExpirationTime("1h")
			.sign(signingKey);

		await expect(verifyPasswordResetJwt(env, token)).rejects.toThrow("Invalid token claims.");
	});

	it("uses the first kid from AUTH_ASSETS JWKS when signing", async () => {
		const authAssets = {
			get: vi.fn(async () => ({
				body: new Response(JSON.stringify({ keys: [{ kid: "kid-from-r2" }] })).body as ReadableStream,
			})),
		};

		const token = await signPasswordResetJwt(
			{
				ISSUER_BASE_URL: "https://auth.test.local",
				JWT_PRIVATE_KEY: privateKeyPem,
				AUTH_ASSETS: authAssets,
			},
			{ challengeId: "c-r2", userId: "u-r2", expiresAt: new Date(Date.now() + 60000) }
		);

		const header = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8")) as {
			kid?: string;
		};
		expect(header.kid).toBe("kid-from-r2");
		expect(authAssets.get).toHaveBeenCalled();
	});

	it("uses default kid when AUTH_ASSETS JWKS has no kid", async () => {
		const authAssets = {
			get: vi.fn(async () => ({
				body: new Response(JSON.stringify({ keys: [{}] })).body as ReadableStream,
			})),
		};

		const token = await signPasswordResetJwt(
			{
				ISSUER_BASE_URL: "https://auth.test.local",
				JWT_PRIVATE_KEY: privateKeyPem,
				AUTH_ASSETS: authAssets,
			},
			{ challengeId: "c-default", userId: "u-default", expiresAt: new Date(Date.now() + 60000) }
		);

		const header = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8")) as {
			kid?: string;
		};
		expect(header.kid).toBe("default");
	});

	it("uses JWT_KID when AUTH_ASSETS does not have a JWKS object", async () => {
		const authAssets = {
			get: vi.fn(async () => null),
		};

		const token = await signPasswordResetJwt(
			{
				ISSUER_BASE_URL: "https://auth.test.local",
				JWT_PRIVATE_KEY: privateKeyPem,
				JWT_KID: "kid-from-env",
				AUTH_ASSETS: authAssets,
			},
			{ challengeId: "c-env", userId: "u-env", expiresAt: new Date(Date.now() + 60000) }
		);

		const header = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8")) as {
			kid?: string;
		};
		expect(header.kid).toBe("kid-from-env");
	});

	it("throws when signing cannot resolve any kid", async () => {
		await expect(
			signPasswordResetJwt(
				{
					ISSUER_BASE_URL: "https://auth.test.local",
					JWT_PRIVATE_KEY: privateKeyPem,
				},
				{ challengeId: "c-no-kid", userId: "u-no-kid", expiresAt: new Date(Date.now() + 60000) }
			)
		).rejects.toThrow("JWKS not available: set JWT_KID or publish JWKS to R2 for password reset signing.");
	});

	it("verifies using process env JWT_JWKS_JSON fallback", async () => {
		const token = await signPasswordResetJwt(env, {
			challengeId: "c-process-jwks",
			userId: "u-process-jwks",
			expiresAt: new Date(Date.now() + 60000),
		});

		vi.stubEnv("JWT_JWKS_JSON", env.JWT_JWKS_JSON as string);
		await expect(verifyPasswordResetJwt({ ISSUER_BASE_URL: "https://auth.test.local" }, token)).resolves.toEqual({
			challengeId: "c-process-jwks",
			userId: "u-process-jwks",
		});
	});

	it("falls back to AUTH_ASSETS when JWT_JWKS_JSON is invalid json", async () => {
		const token = await signPasswordResetJwt(env, {
			challengeId: "c-auth-assets-fallback",
			userId: "u-auth-assets-fallback",
			expiresAt: new Date(Date.now() + 60000),
		});

		const authAssets = {
			get: vi.fn(async () => ({
				body: new Response(env.JWT_JWKS_JSON as string).body as ReadableStream,
			})),
		};

		await expect(
			verifyPasswordResetJwt(
				{
					ISSUER_BASE_URL: "https://auth.test.local",
					JWT_JWKS_JSON: "{not valid json",
					AUTH_ASSETS: authAssets,
				},
				token
			)
		).resolves.toEqual({
			challengeId: "c-auth-assets-fallback",
			userId: "u-auth-assets-fallback",
		});
		expect(authAssets.get).toHaveBeenCalled();
	});
});