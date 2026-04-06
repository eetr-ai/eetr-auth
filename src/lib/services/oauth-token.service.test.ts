import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthorizationCodeRepository, AuthorizationCodeWithScopeIds } from "@/lib/repositories/authorization-code.repository";
import type { Client, ClientRepository } from "@/lib/repositories/client.repository";
import type { EnvironmentRepository } from "@/lib/repositories/environment.repository";
import type { RefreshTokenRecord, RefreshTokenRepository } from "@/lib/repositories/refresh-token.repository";
import type { AccessTokenRecord, ClientScopeGrant, TokenRepository } from "@/lib/repositories/token.repository";
import { OauthTokenService } from "@/lib/services/oauth-token.service";

function createClientRepoMock() {
	return {
		list: vi.fn(),
		getById: vi.fn(),
		getByClientIdentifier: vi.fn(),
		create: vi.fn(),
		delete: vi.fn(),
		getRedirectUris: vi.fn(),
		setRedirectUris: vi.fn(),
		getClientScopes: vi.fn(),
		setClientScopes: vi.fn(),
		updateSecret: vi.fn(),
		updateName: vi.fn(),
	} satisfies ClientRepository;
}

function createAuthorizationCodeRepoMock() {
	return {
		create: vi.fn(),
		getByCodeId: vi.fn(),
		markUsed: vi.fn(),
		deleteUsedOrExpired: vi.fn(),
	} satisfies AuthorizationCodeRepository;
}

function createTokenRepoMock() {
	return {
		createAccessToken: vi.fn(),
		getClientScopeGrants: vi.fn(),
		getClientScopeGrantsByNames: vi.fn(),
		getAccessTokenByTokenId: vi.fn(),
		listAccessTokenActivity: vi.fn(),
		revokeAccessTokenByTokenId: vi.fn(),
		deleteAccessTokenByTokenId: vi.fn(),
		deleteExpiredAccessTokens: vi.fn(),
	} satisfies TokenRepository;
}

function createRefreshTokenRepoMock() {
	return {
		createRefreshToken: vi.fn(),
		getByTokenId: vi.fn(),
		revoke: vi.fn(),
		listRefreshTokenActivity: vi.fn(),
		deleteByTokenId: vi.fn(),
		deleteExpired: vi.fn(),
		deleteRevoked: vi.fn(),
	} satisfies RefreshTokenRepository;
}

function createEnvRepoMock() {
	return {
		list: vi.fn(),
		getById: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
		countClientsByEnvironment: vi.fn(),
	} satisfies EnvironmentRepository;
}

function createService(deps?: {
	clientRepo?: ClientRepository;
	authorizationCodeRepo?: AuthorizationCodeRepository;
	tokenRepo?: TokenRepository;
	refreshTokenRepo?: RefreshTokenRepository;
	envRepo?: EnvironmentRepository;
	env?: CloudflareEnv;
}) {
	return new OauthTokenService({
		clientRepo: deps?.clientRepo ?? createClientRepoMock(),
		authorizationCodeRepo: deps?.authorizationCodeRepo ?? createAuthorizationCodeRepoMock(),
		tokenRepo: deps?.tokenRepo ?? createTokenRepoMock(),
		refreshTokenRepo: deps?.refreshTokenRepo ?? createRefreshTokenRepoMock(),
		envRepo: deps?.envRepo ?? createEnvRepoMock(),
		env: deps?.env ?? ({} as CloudflareEnv),
	});
}

function makeClient(overrides?: Partial<Client>): Client {
	return {
		id: "client-row-1",
		clientId: "client-app-id",
		clientSecret: "plain-secret",
		environmentId: "env-1",
		createdBy: "user-1",
		expiresAt: null,
		name: "Test Client",
		...overrides,
	};
}

function makeGrant(overrides?: Partial<ClientScopeGrant>): ClientScopeGrant {
	return {
		clientScopeId: "client-scope-read",
		scopeId: "scope-read",
		scopeName: "read:users",
		...overrides,
	};
}

function makeAuthorizationCode(overrides?: Partial<AuthorizationCodeWithScopeIds>): AuthorizationCodeWithScopeIds {
	return {
		id: "auth-code-row-1",
		codeId: "code_123",
		clientId: "client-row-1",
		redirectUri: "https://client.example.com/callback",
		codeChallenge: "W7n_wCYtNROQsx8qYdtHSxDymupaS0up7V1qp3otL4Q",
		codeChallengeMethod: "S256",
		subject: "user-123",
		expiresAt: "2026-04-06T13:20:00.000Z",
		usedAt: null,
		createdAt: "2026-04-06T13:10:00.000Z",
		clientScopeIds: ["client-scope-read", "client-scope-write"],
		...overrides,
	};
}

function makeRefreshToken(overrides?: Partial<RefreshTokenRecord>): RefreshTokenRecord {
	return {
		id: "refresh-row-1",
		refreshTokenId: "rt_existing",
		clientId: "client-row-1",
		subject: "user-123",
		accessTokenId: "access-row-1",
		expiresAt: "2026-05-06T13:10:00.000Z",
		revokedAt: null,
		rotatedFromId: null,
		createdAt: "2026-04-06T13:10:00.000Z",
		clientScopeIds: ["client-scope-read", "client-scope-write"],
		...overrides,
	};
}

function makeAccessTokenRecord(overrides?: Partial<AccessTokenRecord>): AccessTokenRecord {
	return {
		id: "access-row-1",
		tokenId: "at_existing",
		clientId: "client-row-1",
		environmentId: "env-1",
		environmentName: "production",
		expiresAt: "2026-04-06T14:10:00.000Z",
		scopeNames: ["read:users", "write:users"],
		...overrides,
	};
}

async function toS256Challenge(value: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return Buffer.from(digest).toString("base64url");
}

describe("OauthTokenService", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-06T13:10:00.000Z"));
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	describe("client authentication", () => {
		it("returns invalid_client for missing client credentials", async () => {
			const service = createService();

			await expect(
				service.exchange({ grantType: "client_credentials", clientId: null, clientSecret: null })
			).rejects.toMatchObject({
				code: "invalid_client",
				message: "Missing client credentials.",
				status: 401,
			});
		});

		it("returns invalid_client for an unknown client", async () => {
			const clientRepo = createClientRepoMock();
			clientRepo.getByClientIdentifier.mockResolvedValue(null);
			const service = createService({ clientRepo });

			await expect(
				service.exchange({ grantType: "client_credentials", clientId: "unknown", clientSecret: "secret" })
			).rejects.toMatchObject({
				code: "invalid_client",
				message: "Invalid client credentials.",
				status: 401,
			});
		});

		it("returns invalid_client for a wrong client secret", async () => {
			const clientRepo = createClientRepoMock();
			clientRepo.getByClientIdentifier.mockResolvedValue(makeClient());
			const service = createService({ clientRepo });

			await expect(
				service.exchange({ grantType: "client_credentials", clientId: "client-app-id", clientSecret: "wrong" })
			).rejects.toMatchObject({
				code: "invalid_client",
				message: "Invalid client credentials.",
				status: 401,
			});
		});

		it("returns invalid_client for expired clients", async () => {
			const clientRepo = createClientRepoMock();
			clientRepo.getByClientIdentifier.mockResolvedValue(
				makeClient({ expiresAt: "2026-04-06T13:09:59.000Z" })
			);
			const service = createService({ clientRepo });

			await expect(
				service.exchange({ grantType: "client_credentials", clientId: "client-app-id", clientSecret: "plain-secret" })
			).rejects.toMatchObject({
				code: "invalid_client",
				message: "Client credentials have expired.",
				status: 401,
			});
		});
	});

	describe("authorization code exchange", () => {
		it.each([
			[{ code: null }, "Missing code."],
			[{ redirectUri: null }, "Missing redirect_uri."],
			[{ codeVerifier: null }, "Missing code_verifier."],
		] as const)("returns invalid_request for missing inputs", async (override, message) => {
			const clientRepo = createClientRepoMock();
			clientRepo.getByClientIdentifier.mockResolvedValue(makeClient());
			const service = createService({ clientRepo });

			await expect(
				service.exchange({
					grantType: "authorization_code",
					clientId: "client-app-id",
					clientSecret: "plain-secret",
					code: "code_123",
					redirectUri: "https://client.example.com/callback",
					codeVerifier: "verifier-123",
					...override,
				})
			).rejects.toMatchObject({ code: "invalid_request", message, status: 400 });
		});

		it("returns invalid_grant for an unknown authorization code", async () => {
			const clientRepo = createClientRepoMock();
			const authorizationCodeRepo = createAuthorizationCodeRepoMock();
			clientRepo.getByClientIdentifier.mockResolvedValue(makeClient());
			authorizationCodeRepo.getByCodeId.mockResolvedValue(null);
			const service = createService({ clientRepo, authorizationCodeRepo });

			await expect(
				service.exchange({
					grantType: "authorization_code",
					clientId: "client-app-id",
					clientSecret: "plain-secret",
					code: "missing",
					redirectUri: "https://client.example.com/callback",
					codeVerifier: "verifier-123",
				})
			).rejects.toMatchObject({ code: "invalid_grant", message: "Authorization code is invalid.", status: 400 });
		});

		it.each([
			[makeAuthorizationCode({ usedAt: "2026-04-06T13:09:00.000Z" }), "Authorization code has already been used."],
			[makeAuthorizationCode({ expiresAt: "2026-04-06T13:09:59.000Z" }), "Authorization code has expired."],
			[makeAuthorizationCode({ clientId: "other-client" }), "Authorization code does not belong to this client."],
			[makeAuthorizationCode({ redirectUri: "https://client.example.com/other" }), "redirect_uri does not match code."],
		] as const)("returns invalid_grant for invalid stored code state", async (authorizationCode, message) => {
			const clientRepo = createClientRepoMock();
			const authorizationCodeRepo = createAuthorizationCodeRepoMock();
			clientRepo.getByClientIdentifier.mockResolvedValue(makeClient());
			authorizationCodeRepo.getByCodeId.mockResolvedValue(authorizationCode);
			const service = createService({ clientRepo, authorizationCodeRepo });

			await expect(
				service.exchange({
					grantType: "authorization_code",
					clientId: "client-app-id",
					clientSecret: "plain-secret",
					code: authorizationCode.codeId,
					redirectUri: "https://client.example.com/callback",
					codeVerifier: "verifier-123",
				})
			).rejects.toMatchObject({ code: "invalid_grant", message, status: 400 });
		});

		it("returns invalid_grant when PKCE verification fails", async () => {
			const clientRepo = createClientRepoMock();
			const authorizationCodeRepo = createAuthorizationCodeRepoMock();
			clientRepo.getByClientIdentifier.mockResolvedValue(makeClient());
			authorizationCodeRepo.getByCodeId.mockResolvedValue(
				makeAuthorizationCode({ codeChallenge: await toS256Challenge("other-verifier") })
			);
			const service = createService({ clientRepo, authorizationCodeRepo });

			await expect(
				service.exchange({
					grantType: "authorization_code",
					clientId: "client-app-id",
					clientSecret: "plain-secret",
					code: "code_123",
					redirectUri: "https://client.example.com/callback",
					codeVerifier: "verifier-123",
				})
			).rejects.toMatchObject({
				code: "invalid_grant",
				message: "code_verifier does not match code_challenge.",
				status: 400,
			});
		});

		it("marks the code used and returns an opaque token response on success", async () => {
			const clientRepo = createClientRepoMock();
			const authorizationCodeRepo = createAuthorizationCodeRepoMock();
			const tokenRepo = createTokenRepoMock();
			const refreshTokenRepo = createRefreshTokenRepoMock();
			clientRepo.getByClientIdentifier.mockResolvedValue(makeClient());
			authorizationCodeRepo.getByCodeId.mockResolvedValue(
				makeAuthorizationCode({ codeChallenge: await toS256Challenge("verifier-123") })
			);
			tokenRepo.getClientScopeGrants.mockResolvedValue([
				makeGrant({ clientScopeId: "client-scope-read", scopeName: "read:users" }),
				makeGrant({ clientScopeId: "client-scope-write", scopeId: "scope-write", scopeName: "write:users" }),
			]);
			const service = createService({ clientRepo, authorizationCodeRepo, tokenRepo, refreshTokenRepo });

			const result = await service.exchange({
				grantType: "authorization_code",
				clientId: "client-app-id",
				clientSecret: "plain-secret",
				code: "code_123",
				redirectUri: "https://client.example.com/callback",
				codeVerifier: "verifier-123",
			});

			expect(authorizationCodeRepo.markUsed).toHaveBeenCalledWith(
				"auth-code-row-1",
				"2026-04-06T13:10:00.000Z"
			);
			expect(tokenRepo.createAccessToken).toHaveBeenCalledWith(
				expect.objectContaining({
					token_id: expect.stringMatching(/^at_[0-9a-f]{64}$/),
					client_id: "client-row-1",
					expires_at: "2026-04-06T14:10:00.000Z",
				}),
				["client-scope-read", "client-scope-write"]
			);
			expect(refreshTokenRepo.createRefreshToken).toHaveBeenCalledWith(
				expect.objectContaining({
					refresh_token_id: expect.stringMatching(/^rt_[0-9a-f]{64}$/),
					client_id: "client-row-1",
					subject: "user-123",
					expires_at: "2026-05-06T13:10:00.000Z",
					rotated_from_id: null,
					created_at: "2026-04-06T13:10:00.000Z",
				}),
				["client-scope-read", "client-scope-write"]
			);
			expect(result).toMatchObject({
				token_type: "Bearer",
				expires_in: 3600,
				scope: "read:users write:users",
			});
			expect(result.access_token).toMatch(/^at_[0-9a-f]{64}$/);
			expect(result.refresh_token).toMatch(/^rt_[0-9a-f]{64}$/);
		});
	});

	describe("refresh token exchange", () => {
		it.each([
			[null, "Refresh token is invalid."],
			[makeRefreshToken({ revokedAt: "2026-04-06T13:09:00.000Z" }), "Refresh token has been revoked."],
			[makeRefreshToken({ expiresAt: "2026-04-06T13:09:59.000Z" }), "Refresh token has expired."],
			[makeRefreshToken({ clientId: "other-client" }), "Refresh token does not belong to this client."],
		] as const)("returns invalid_grant for invalid refresh token state", async (refreshRecord, message) => {
			const clientRepo = createClientRepoMock();
			const refreshTokenRepo = createRefreshTokenRepoMock();
			clientRepo.getByClientIdentifier.mockResolvedValue(makeClient());
			refreshTokenRepo.getByTokenId.mockResolvedValue(refreshRecord as RefreshTokenRecord | null);
			const service = createService({ clientRepo, refreshTokenRepo });

			await expect(
				service.exchange({
					grantType: "refresh_token",
					clientId: "client-app-id",
					clientSecret: "plain-secret",
					refreshToken: "rt_existing",
				})
			).rejects.toMatchObject({ code: "invalid_grant", message, status: 400 });
		});

		it("rotates the refresh token pair on success", async () => {
			const clientRepo = createClientRepoMock();
			const tokenRepo = createTokenRepoMock();
			const refreshTokenRepo = createRefreshTokenRepoMock();
			clientRepo.getByClientIdentifier.mockResolvedValue(makeClient());
			refreshTokenRepo.getByTokenId.mockResolvedValue(makeRefreshToken());
			tokenRepo.getClientScopeGrants.mockResolvedValue([
				makeGrant({ clientScopeId: "client-scope-read", scopeName: "read:users" }),
				makeGrant({ clientScopeId: "client-scope-write", scopeId: "scope-write", scopeName: "write:users" }),
			]);
			const service = createService({ clientRepo, tokenRepo, refreshTokenRepo });

			const result = await service.exchange({
				grantType: "refresh_token",
				clientId: "client-app-id",
				clientSecret: "plain-secret",
				refreshToken: "rt_existing",
			});

			expect(refreshTokenRepo.revoke).toHaveBeenCalledWith("refresh-row-1", "2026-04-06T13:10:00.000Z");
			expect(refreshTokenRepo.createRefreshToken).toHaveBeenCalledWith(
				expect.objectContaining({ rotated_from_id: "refresh-row-1", subject: "user-123" }),
				["client-scope-read", "client-scope-write"]
			);
			expect(result.access_token).toMatch(/^at_[0-9a-f]{64}$/);
			expect(result.refresh_token).toMatch(/^rt_[0-9a-f]{64}$/);
		});
	});

	describe("validateAccessToken", () => {
		it("returns inactive for unknown tokens", async () => {
			const tokenRepo = createTokenRepoMock();
			tokenRepo.getAccessTokenByTokenId.mockResolvedValue(null);
			const service = createService({ tokenRepo });

			await expect(service.validateAccessToken("missing", [], null)).resolves.toMatchObject({
				valid: false,
				active: false,
				clientId: null,
			});
		});

		it("returns active for a valid opaque access token", async () => {
			const tokenRepo = createTokenRepoMock();
			tokenRepo.getAccessTokenByTokenId.mockResolvedValue(makeAccessTokenRecord());
			const service = createService({ tokenRepo });

			await expect(service.validateAccessToken("at_existing", ["read:users"], "production")).resolves.toMatchObject({
				valid: true,
				active: true,
				clientId: "client-row-1",
				environmentMatch: true,
				missingScopes: [],
			});
		});

		it("returns expired for an access token past its expiry", async () => {
			const tokenRepo = createTokenRepoMock();
			tokenRepo.getAccessTokenByTokenId.mockResolvedValue(
				makeAccessTokenRecord({ expiresAt: "2026-04-06T13:09:59.000Z" })
			);
			const service = createService({ tokenRepo });

			await expect(service.validateAccessToken("at_existing", [], null)).resolves.toMatchObject({
				valid: false,
				active: false,
				expiresAt: "2026-04-06T13:09:59.000Z",
			});
		});

		it("returns inactive when repository lookup yields no token record", async () => {
			const tokenRepo = createTokenRepoMock();
			tokenRepo.getAccessTokenByTokenId.mockResolvedValue(null);
			const service = createService({ tokenRepo });

			await expect(service.validateAccessToken("revoked-or-missing", [], null)).resolves.toMatchObject({
				valid: false,
				active: false,
			});
		});
	});
});