import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthorizationCodeRepository } from "@/lib/repositories/authorization-code.repository";
import type { ClientRepository, Client } from "@/lib/repositories/client.repository";
import type { TokenRepository, ClientScopeGrant } from "@/lib/repositories/token.repository";
import type { UserRepository } from "@/lib/repositories/admin.repository";
import { OauthAuthorizationService } from "@/lib/services/oauth-authorization.service";
import type { ConsentService } from "@/lib/services/consent.service";

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

function createTokenRepoMock() {
	return {
		createAccessToken: vi.fn(),
		getClientScopeGrants: vi.fn(),
		getClientScopeGrantsByNames: vi.fn(),
		getAccessTokenByTokenId: vi.fn(),
		listAccessTokenActivity: vi.fn(),
		revokeAccessTokenByTokenId: vi.fn(),
		expireAccessTokensByIds: vi.fn(),
		deleteAccessTokenByTokenId: vi.fn(),
		deleteExpiredAccessTokens: vi.fn(),
	} satisfies TokenRepository;
}

function createAuthorizationCodeRepoMock() {
	return {
		create: vi.fn(),
		getByCodeId: vi.fn(),
		markUsed: vi.fn(),
		deleteUnusedForSubjectAndClient: vi.fn(),
		deleteUsedOrExpired: vi.fn(),
	} satisfies AuthorizationCodeRepository;
}

/** Defaults to granting the user the client's environment ("env-1") so happy paths pass. */
function createUserRepoMock(environmentIds: string[] = ["env-1"]) {
	return {
		listTestUsersByEnvironment: vi.fn().mockResolvedValue([]),
		getUserEnvironments: vi.fn().mockResolvedValue(environmentIds),
	} as unknown as UserRepository;
}

/** Consent recording is a side effect of authorize; stub it so these tests stay focused. */
function createConsentServiceMock() {
	return { record: vi.fn() } as unknown as ConsentService;
}

function createService(deps?: {
	clientRepo?: ClientRepository;
	tokenRepo?: TokenRepository;
	authorizationCodeRepo?: AuthorizationCodeRepository;
	userRepo?: UserRepository;
	consentService?: ConsentService;
}) {
	return new OauthAuthorizationService({
		clientRepo: deps?.clientRepo ?? createClientRepoMock(),
		tokenRepo: deps?.tokenRepo ?? createTokenRepoMock(),
		authorizationCodeRepo: deps?.authorizationCodeRepo ?? createAuthorizationCodeRepoMock(),
		userRepo: deps?.userRepo ?? createUserRepoMock(),
		consentService: deps?.consentService ?? createConsentServiceMock(),
	});
}

function makeClient(overrides?: Partial<Client>): Client {
	return {
		id: "client-db-id",
		clientId: "client-app-id",
		clientSecret: "stored-secret",
		environmentId: "env-1",
		createdBy: "user-1",
		expiresAt: null,
		name: "Test Client",
		tokenEndpointAuthMethod: "client_secret_basic",
		isDynamic: false,
		isTest: false,
		...overrides,
	};
}

function makeGrant(overrides?: Partial<ClientScopeGrant>): ClientScopeGrant {
	return {
		clientScopeId: "client-scope-1",
		scopeId: "scope-1",
		scopeName: "read:users",
		...overrides,
	};
}

const baseParams = {
	responseType: "code",
	clientId: "client-app-id",
	redirectUri: "https://client.example.com/callback",
	scope: "read:users write:users",
	state: "state-123",
	codeChallenge: "challenge-123",
	codeChallengeMethod: "S256",
	subject: "user-123",
} as const;

describe("OauthAuthorizationService", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-06T13:10:00.000Z"));
		vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("authorization-row-id");
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("rejects unsupported response types", async () => {
		const service = createService();

		await expect(
			service.authorize({ ...baseParams, responseType: "token" })
		).rejects.toMatchObject({
			code: "unsupported_response_type",
			message: "Only response_type=code is supported.",
			status: 400,
		});
	});

	it.each([
		["clientId", "Missing client_id."],
		["redirectUri", "Missing redirect_uri."],
		["codeChallenge", "Missing code_challenge."],
	] as const)("rejects when %s is missing", async (field, message) => {
		const service = createService();
		const params = { ...baseParams, [field]: null };

		await expect(service.authorize(params)).rejects.toMatchObject({
			code: "invalid_request",
			message,
			status: 400,
		});
	});

	it("rejects unsupported PKCE challenge methods", async () => {
		const service = createService();

		await expect(
			service.authorize({ ...baseParams, codeChallengeMethod: "plain" })
		).rejects.toMatchObject({
			code: "invalid_request",
			message: "code_challenge_method must be S256.",
			status: 400,
		});
	});

	it("rejects unknown clients", async () => {
		const clientRepo = createClientRepoMock();
		clientRepo.getByClientIdentifier.mockResolvedValue(null);
		const service = createService({
			clientRepo,
			tokenRepo: createTokenRepoMock(),
			authorizationCodeRepo: createAuthorizationCodeRepoMock(),
		});

		await expect(service.authorize(baseParams)).rejects.toMatchObject({
			code: "unauthorized_client",
			message: "Unknown client.",
			status: 401,
		});
	});

	it("rejects expired clients", async () => {
		const clientRepo = createClientRepoMock();
		clientRepo.getByClientIdentifier.mockResolvedValue(
			makeClient({ expiresAt: "2026-04-06T13:09:59.000Z" })
		);
		const service = createService({
			clientRepo,
			tokenRepo: createTokenRepoMock(),
			authorizationCodeRepo: createAuthorizationCodeRepoMock(),
		});

		await expect(service.authorize(baseParams)).rejects.toMatchObject({
			code: "unauthorized_client",
			message: "Client credentials have expired.",
			status: 401,
		});
	});

	it("rejects a user without access to the client's environment", async () => {
		const clientRepo = createClientRepoMock();
		clientRepo.getByClientIdentifier.mockResolvedValue(makeClient({ environmentId: "env-prod" }));
		const service = createService({
			clientRepo,
			userRepo: createUserRepoMock(["env-dev"]),
		});

		await expect(service.authorize(baseParams)).rejects.toMatchObject({
			code: "access_denied",
			message: "You do not have access to this application.",
			status: 403,
		});
	});

	it("allows a user granted the client's environment to proceed past the access gate", async () => {
		const clientRepo = createClientRepoMock();
		clientRepo.getByClientIdentifier.mockResolvedValue(makeClient({ environmentId: "env-prod" }));
		// No redirect URIs registered → fails the next check, proving the access gate passed.
		clientRepo.getRedirectUris.mockResolvedValue([]);
		const service = createService({
			clientRepo,
			userRepo: createUserRepoMock(["env-prod"]),
		});

		await expect(service.authorize(baseParams)).rejects.toMatchObject({
			code: "invalid_request",
			message: "Invalid redirect_uri.",
		});
	});

	it("rejects redirect URIs outside the client allowlist", async () => {
		const clientRepo = createClientRepoMock();
		clientRepo.getByClientIdentifier.mockResolvedValue(makeClient());
		clientRepo.getRedirectUris.mockResolvedValue(["https://client.example.com/other"]);
		const service = createService({
			clientRepo,
			tokenRepo: createTokenRepoMock(),
			authorizationCodeRepo: createAuthorizationCodeRepoMock(),
		});

		await expect(service.authorize(baseParams)).rejects.toMatchObject({
			code: "invalid_request",
			message: "Invalid redirect_uri.",
			status: 400,
		});
	});

	describe("loopback redirect URIs", () => {
		// Next.js rewrites loopback hosts to `localhost` throughout the request URL string, so a
		// redirect_uri query parameter arrives mangled while the registration (a JSON body) kept
		// 127.0.0.1. Both spellings address the same local port and must match.
		const loopbackParams = {
			...baseParams,
			redirectUri: "http://localhost:57162/callback/iDt-RqU9krou",
		} as const;
		const registeredUri = "http://127.0.0.1:57162/callback/iDt-RqU9krou";

		function createLoopbackService(registered: string[]) {
			const clientRepo = createClientRepoMock();
			const tokenRepo = createTokenRepoMock();
			const authorizationCodeRepo = createAuthorizationCodeRepoMock();
			clientRepo.getByClientIdentifier.mockResolvedValue(makeClient());
			clientRepo.getRedirectUris.mockResolvedValue(registered);
			tokenRepo.getClientScopeGrantsByNames.mockResolvedValue([
				makeGrant({ clientScopeId: "client-scope-read", scopeName: "read:users" }),
				makeGrant({
					clientScopeId: "client-scope-write",
					scopeId: "scope-2",
					scopeName: "write:users",
				}),
			]);
			return {
				service: createService({ clientRepo, tokenRepo, authorizationCodeRepo }),
				authorizationCodeRepo,
			};
		}

		it("accepts a localhost request against a 127.0.0.1 registration", async () => {
			const { service } = createLoopbackService([registeredUri]);

			const result = await service.authorize(loopbackParams);

			const redirect = new URL(result.redirectTo);
			expect(redirect.searchParams.get("code")).toMatch(/^code_[0-9a-f]{64}$/);
			expect(redirect.searchParams.get("state")).toBe(loopbackParams.state);
		});

		it("redirects the browser to the registered spelling, not the requested one", async () => {
			const { service } = createLoopbackService([registeredUri]);

			const result = await service.authorize(loopbackParams);

			const redirect = new URL(result.redirectTo);
			expect(redirect.origin + redirect.pathname).toBe(registeredUri);
		});

		it("binds the authorization code to the registered spelling", async () => {
			// The token exchange receives redirect_uri in an unmangled body and compares it to the
			// code; binding the requested (mangled) form here would break that comparison.
			const { service, authorizationCodeRepo } = createLoopbackService([registeredUri]);

			await service.authorize(loopbackParams);

			expect(authorizationCodeRepo.create).toHaveBeenCalledWith(
				expect.objectContaining({ redirect_uri: registeredUri }),
				expect.any(Array)
			);
		});

		it("accepts a 127.0.0.1 request against a localhost registration", async () => {
			const { service, authorizationCodeRepo } = createLoopbackService([
				"http://localhost:6274/oauth/callback",
			]);

			await service.authorize({
				...baseParams,
				redirectUri: "http://127.0.0.1:6274/oauth/callback",
			});

			expect(authorizationCodeRepo.create).toHaveBeenCalledWith(
				expect.objectContaining({ redirect_uri: "http://localhost:6274/oauth/callback" }),
				expect.any(Array)
			);
		});

		it("still rejects a loopback URI on a different port", async () => {
			// Codex binds a fresh ephemeral port per attempt; a stale port must not be honoured.
			const { service } = createLoopbackService(["http://127.0.0.1:59836/callback/x"]);

			await expect(
				service.authorize({ ...baseParams, redirectUri: "http://localhost:60033/callback/x" })
			).rejects.toMatchObject({ code: "invalid_request", message: "Invalid redirect_uri." });
		});

		it("still rejects a non-loopback host against a loopback registration", async () => {
			const { service } = createLoopbackService(["http://127.0.0.1:57162/callback/x"]);

			await expect(
				service.authorize({
					...baseParams,
					redirectUri: "http://localhost.evil.com:57162/callback/x",
				})
			).rejects.toMatchObject({ code: "invalid_request", message: "Invalid redirect_uri." });
		});

		it("reports the registered spelling on the invalid_scope error redirect", async () => {
			const clientRepo = createClientRepoMock();
			const tokenRepo = createTokenRepoMock();
			clientRepo.getByClientIdentifier.mockResolvedValue(makeClient());
			clientRepo.getRedirectUris.mockResolvedValue([registeredUri]);
			tokenRepo.getClientScopeGrantsByNames.mockResolvedValue([makeGrant()]);
			const service = createService({
				clientRepo,
				tokenRepo,
				authorizationCodeRepo: createAuthorizationCodeRepoMock(),
			});

			await expect(service.authorize(loopbackParams)).rejects.toMatchObject({
				code: "invalid_scope",
				redirectUri: registeredUri,
			});
		});
	});

	it("rejects scope requests the client has not been granted", async () => {
		const clientRepo = createClientRepoMock();
		const tokenRepo = createTokenRepoMock();
		clientRepo.getByClientIdentifier.mockResolvedValue(makeClient());
		clientRepo.getRedirectUris.mockResolvedValue([baseParams.redirectUri]);
		tokenRepo.getClientScopeGrantsByNames.mockResolvedValue([makeGrant()]);
		const service = createService({
			clientRepo,
			tokenRepo,
			authorizationCodeRepo: createAuthorizationCodeRepoMock(),
		});

		await expect(service.authorize(baseParams)).rejects.toMatchObject({
			code: "invalid_scope",
			message: "Requested scopes are not allowed for this client.",
			status: 400,
			redirectUri: baseParams.redirectUri,
			state: baseParams.state,
		});
		expect(tokenRepo.getClientScopeGrantsByNames).toHaveBeenCalledWith("client-db-id", [
			"read:users",
			"write:users",
		]);
	});

	it("creates an authorization code and returns a redirect with code and state", async () => {
		const clientRepo = createClientRepoMock();
		const tokenRepo = createTokenRepoMock();
		const authorizationCodeRepo = createAuthorizationCodeRepoMock();
		clientRepo.getByClientIdentifier.mockResolvedValue(makeClient());
		clientRepo.getRedirectUris.mockResolvedValue([baseParams.redirectUri]);
		tokenRepo.getClientScopeGrantsByNames.mockResolvedValue([
			makeGrant({ clientScopeId: "client-scope-read", scopeName: "read:users" }),
			makeGrant({ clientScopeId: "client-scope-write", scopeId: "scope-2", scopeName: "write:users" }),
		]);
		const service = createService({ clientRepo, tokenRepo, authorizationCodeRepo });

		const result = await service.authorize(baseParams);
		const redirect = new URL(result.redirectTo);
		const createdRow = authorizationCodeRepo.create.mock.calls[0]?.[0];

		expect(redirect.origin + redirect.pathname).toBe(baseParams.redirectUri);
		expect(redirect.searchParams.get("state")).toBe(baseParams.state);
		expect(redirect.searchParams.get("code")).toBe(createdRow.code_id);
		expect(authorizationCodeRepo.create).toHaveBeenCalledWith(
			expect.objectContaining({
				id: "authorization-row-id",
				code_id: expect.stringMatching(/^code_[0-9a-f]{64}$/),
				client_id: "client-db-id",
				redirect_uri: baseParams.redirectUri,
				code_challenge: baseParams.codeChallenge,
				code_challenge_method: "S256",
				subject: baseParams.subject,
				expires_at: "2026-04-06T13:15:00.000Z",
				used_at: null,
				created_at: "2026-04-06T13:10:00.000Z",
			}),
			["client-scope-read", "client-scope-write"]
		);
	});

	it("binds the OIDC nonce and records auth_time on the authorization code", async () => {
		const clientRepo = createClientRepoMock();
		const tokenRepo = createTokenRepoMock();
		const authorizationCodeRepo = createAuthorizationCodeRepoMock();
		clientRepo.getByClientIdentifier.mockResolvedValue(makeClient());
		clientRepo.getRedirectUris.mockResolvedValue([baseParams.redirectUri]);
		tokenRepo.getClientScopeGrantsByNames.mockResolvedValue([
			makeGrant({ clientScopeId: "client-scope-read", scopeName: "read:users" }),
			makeGrant({ clientScopeId: "client-scope-write", scopeId: "scope-2", scopeName: "write:users" }),
		]);
		const service = createService({ clientRepo, tokenRepo, authorizationCodeRepo });

		await service.authorize({ ...baseParams, nonce: "n-0S6_WzA2Mj" });

		expect(authorizationCodeRepo.create).toHaveBeenCalledWith(
			expect.objectContaining({
				nonce: "n-0S6_WzA2Mj",
				auth_time: "2026-04-06T13:10:00.000Z",
			}),
			expect.any(Array)
		);
	});

	it("stores a null nonce when the request omits it", async () => {
		const clientRepo = createClientRepoMock();
		const tokenRepo = createTokenRepoMock();
		const authorizationCodeRepo = createAuthorizationCodeRepoMock();
		clientRepo.getByClientIdentifier.mockResolvedValue(makeClient());
		clientRepo.getRedirectUris.mockResolvedValue([baseParams.redirectUri]);
		tokenRepo.getClientScopeGrantsByNames.mockResolvedValue([
			makeGrant({ clientScopeId: "client-scope-read", scopeName: "read:users" }),
			makeGrant({ clientScopeId: "client-scope-write", scopeId: "scope-2", scopeName: "write:users" }),
		]);
		const service = createService({ clientRepo, tokenRepo, authorizationCodeRepo });

		await service.authorize(baseParams);

		expect(authorizationCodeRepo.create).toHaveBeenCalledWith(
			expect.objectContaining({ nonce: null, auth_time: "2026-04-06T13:10:00.000Z" }),
			expect.any(Array)
		);
	});

	it("omits state and uses all grants when no scope parameter is provided", async () => {
		const clientRepo = createClientRepoMock();
		const tokenRepo = createTokenRepoMock();
		const authorizationCodeRepo = createAuthorizationCodeRepoMock();
		clientRepo.getByClientIdentifier.mockResolvedValue(makeClient());
		clientRepo.getRedirectUris.mockResolvedValue([baseParams.redirectUri]);
		tokenRepo.getClientScopeGrants.mockResolvedValue([
			makeGrant({ clientScopeId: "client-scope-1" }),
			makeGrant({ clientScopeId: "client-scope-2", scopeId: "scope-2", scopeName: "write:users" }),
		]);
		const service = createService({ clientRepo, tokenRepo, authorizationCodeRepo });

		const result = await service.authorize({ ...baseParams, scope: null, state: null });
		const redirect = new URL(result.redirectTo);

		expect(redirect.searchParams.has("state")).toBe(false);
		expect(redirect.searchParams.get("code")).toBeTruthy();
		expect(tokenRepo.getClientScopeGrants).toHaveBeenCalledWith("client-db-id");
		expect(tokenRepo.getClientScopeGrantsByNames).not.toHaveBeenCalled();
		expect(authorizationCodeRepo.create).toHaveBeenCalledWith(expect.any(Object), [
			"client-scope-1",
			"client-scope-2",
		]);
	});
});