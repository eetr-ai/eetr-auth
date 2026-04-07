import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/types";

import type { UserRepository } from "@/lib/repositories/admin.repository";
import type {
	PasskeyCredentialRow,
	PasskeyExchangeTokenRow,
	PasskeyRepository,
} from "@/lib/repositories/passkey.repository";
import type { SiteSettingsRepository } from "@/lib/repositories/site-settings.repository";
import {
	fallbackRpIdFromRpId,
	isIpAddress,
	PasskeyService,
	rpIdFromOrigin,
} from "@/lib/services/passkey.service";

vi.mock("@simplewebauthn/server", () => ({
	generateRegistrationOptions: vi.fn(),
	verifyRegistrationResponse: vi.fn(),
	generateAuthenticationOptions: vi.fn(),
	verifyAuthenticationResponse: vi.fn(),
}));

const generateRegistrationOptionsMock = vi.mocked(generateRegistrationOptions);
const verifyRegistrationResponseMock = vi.mocked(verifyRegistrationResponse);
const generateAuthenticationOptionsMock = vi.mocked(generateAuthenticationOptions);
const verifyAuthenticationResponseMock = vi.mocked(verifyAuthenticationResponse);

function createRepoMock() {
	return {
		insertChallenge: vi.fn(),
		getChallengeById: vi.fn(),
		deleteChallenge: vi.fn(),
		deleteExpiredChallenges: vi.fn(),
		insertCredential: vi.fn(),
		findCredentialById: vi.fn(),
		findCredentialsByUserId: vi.fn(),
		updateCredentialCounter: vi.fn(),
		deleteCredential: vi.fn(),
		hasCredentialForUser: vi.fn(),
		insertExchangeToken: vi.fn(),
		consumeExchangeToken: vi.fn(),
	} satisfies PasskeyRepository;
}

function createUserRepoMock() {
	return {
		create: vi.fn(),
		list: vi.fn(),
		findByUsername: vi.fn(),
		findByEmail: vi.fn(),
		getById: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
	} satisfies UserRepository;
}

function createSiteRepoMock() {
	return {
		get: vi.fn(),
		update: vi.fn(),
	} satisfies SiteSettingsRepository;
}

function createService(deps?: {
	repo?: PasskeyRepository;
	userRepo?: UserRepository;
	siteRepo?: SiteSettingsRepository;
	env?: CloudflareEnv;
}) {
	return new PasskeyService({
		repo: deps?.repo ?? createRepoMock(),
		userRepo: deps?.userRepo ?? createUserRepoMock(),
		siteRepo: deps?.siteRepo ?? createSiteRepoMock(),
		env:
			deps?.env ??
			({
				ISSUER_BASE_URL: "https://auth.example.com",
			} as unknown as CloudflareEnv),
	});
}

function makeCredentialRow(overrides?: Partial<PasskeyCredentialRow>): PasskeyCredentialRow {
	return {
		id: "credential-row-1",
		userId: "user-1",
		credentialId: "credential-base64url",
		publicKey: "public-key-base64url",
		counter: 5,
		deviceType: "singleDevice",
		backedUp: false,
		transports: JSON.stringify(["internal"]),
		createdAt: "2026-04-06T13:20:00.000Z",
		...overrides,
	};
}

function makeExchangeTokenRow(overrides?: Partial<PasskeyExchangeTokenRow>): PasskeyExchangeTokenRow {
	return {
		id: "exchange-1",
		userId: "user-1",
		expiresAt: "2026-04-06T13:22:00.000Z",
		usedAt: null,
		...overrides,
	};
}

describe("passkey helpers", () => {
	it("rpIdFromOrigin strips protocol and port", () => {
		expect(rpIdFromOrigin("https://Auth.Example.com:3000/")).toBe("auth.example.com");
	});

	it("isIpAddress distinguishes IPs from hostnames", () => {
		expect(isIpAddress("127.0.0.1")).toBe(true);
		expect(isIpAddress("2001:db8::1")).toBe(true);
		expect(isIpAddress("auth.example.com")).toBe(false);
	});

	it("fallbackRpIdFromRpId returns the registrable parent domain when available", () => {
		expect(fallbackRpIdFromRpId("auth.example.com")).toBe("example.com");
		expect(fallbackRpIdFromRpId("localhost")).toBeNull();
		expect(fallbackRpIdFromRpId("127.0.0.1")).toBeNull();
		expect(fallbackRpIdFromRpId("example.com")).toBeNull();
	});
});

describe("PasskeyService", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-06T13:20:00.000Z"));
		vi.spyOn(globalThis.crypto, "randomUUID")
			.mockReturnValueOnce("challenge-1")
			.mockReturnValueOnce("credential-row-1")
			.mockReturnValueOnce("challenge-2")
			.mockReturnValueOnce("exchange-token-1");
		vi.spyOn(console, "info").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		generateRegistrationOptionsMock.mockReset();
		verifyRegistrationResponseMock.mockReset();
		generateAuthenticationOptionsMock.mockReset();
		verifyAuthenticationResponseMock.mockReset();
	});

	it("generateRegistrationChallenge stores the challenge and returns options", async () => {
		const repo = createRepoMock();
		const userRepo = createUserRepoMock();
		const siteRepo = createSiteRepoMock();
		userRepo.getById.mockResolvedValue({
			id: "user-1",
			username: "alice",
			name: "Alice",
			email: "alice@example.com",
			avatarKey: null,
			isAdmin: false,
		});
		repo.findCredentialsByUserId.mockResolvedValue([]);
		siteRepo.get.mockResolvedValue({
			siteTitle: "Example Auth",
			siteUrl: "https://app.example.com",
			cdnUrl: null,
			logoKey: null,
			mfaEnabled: true,
		});
		generateRegistrationOptionsMock.mockResolvedValue({
			challenge: "registration-challenge",
			rp: { name: "Example Auth", id: "auth.example.com" },
		} as never);
		const service = createService({ repo, userRepo, siteRepo, env: { ISSUER_BASE_URL: "https://auth.example.com" } as CloudflareEnv });

		const result = await service.generateRegistrationChallenge("user-1");

		expect(generateRegistrationOptionsMock).toHaveBeenCalledWith(
			expect.objectContaining({
				rpName: "Example Auth",
				rpID: "auth.example.com",
				userName: "alice",
				userDisplayName: "Alice",
				userID: "user-1",
			})
		);
		expect(repo.insertChallenge).toHaveBeenCalledWith({
			id: "challenge-1",
			userId: "user-1",
			challenge: "registration-challenge",
			kind: "registration",
			expiresAt: "2026-04-06T13:25:00.000Z",
		});
		expect(result).toEqual({
			challengeId: "challenge-1",
			options: expect.objectContaining({ challenge: "registration-challenge" }),
		});
	});

	it("verifyAndStoreRegistration rejects missing challenges", async () => {
		const repo = createRepoMock();
		repo.getChallengeById.mockResolvedValue(null);
		const service = createService({ repo });

		await expect(
			service.verifyAndStoreRegistration("user-1", "missing", {} as RegistrationResponseJSON)
		).rejects.toThrow("Invalid or expired registration challenge.");
	});

	it("verifyAndStoreRegistration rejects expired challenges and deletes them", async () => {
		const repo = createRepoMock();
		repo.getChallengeById.mockResolvedValue({
			id: "challenge-1",
			userId: "user-1",
			challenge: "registration-challenge",
			kind: "registration",
			expiresAt: "2026-04-06T13:19:59.000Z",
		});
		const service = createService({ repo });

		await expect(
			service.verifyAndStoreRegistration("user-1", "challenge-1", {} as RegistrationResponseJSON)
		).rejects.toThrow("Registration challenge has expired.");
		expect(repo.deleteChallenge).toHaveBeenCalledWith("challenge-1");
	});

	it("verifyAndStoreRegistration verifies with the correct rpId and persists the credential", async () => {
		const repo = createRepoMock();
		const siteRepo = createSiteRepoMock();
		repo.getChallengeById.mockResolvedValue({
			id: "challenge-1",
			userId: "user-1",
			challenge: "registration-challenge",
			kind: "registration",
			expiresAt: "2026-04-06T13:25:00.000Z",
		});
		siteRepo.get.mockResolvedValue({
			siteTitle: "Example Auth",
			siteUrl: null,
			cdnUrl: null,
			logoKey: null,
			mfaEnabled: true,
		});
		verifyRegistrationResponseMock.mockResolvedValue({
			verified: true,
			registrationInfo: {
				credentialID: new Uint8Array([1, 2, 3]),
				credentialPublicKey: new Uint8Array([4, 5, 6]),
				counter: 7,
				credentialDeviceType: "singleDevice",
				credentialBackedUp: false,
			},
		} as never);
		const response = {
			id: "web-authn-credential-id",
			response: { transports: ["internal"] },
		} as unknown as RegistrationResponseJSON;
		const service = createService({ repo, siteRepo, env: { ISSUER_BASE_URL: "https://auth.example.com" } as CloudflareEnv });

		const credential = await service.verifyAndStoreRegistration("user-1", "challenge-1", response);

		expect(verifyRegistrationResponseMock).toHaveBeenCalledWith(
			expect.objectContaining({
				expectedChallenge: "registration-challenge",
				expectedOrigin: "https://auth.example.com",
				expectedRPID: "auth.example.com",
			})
		);
		expect(repo.insertCredential).toHaveBeenCalledWith(
			expect.objectContaining({
				id: "challenge-1",
				userId: "user-1",
				counter: 7,
				deviceType: "singleDevice",
				backedUp: false,
			})
		);
		expect(repo.deleteChallenge).toHaveBeenCalledWith("challenge-1");
		expect(credential.userId).toBe("user-1");
	});

	it("verifyAndStoreRegistration throws when WebAuthn verification fails", async () => {
		const repo = createRepoMock();
		repo.getChallengeById.mockResolvedValue({
			id: "challenge-1",
			userId: "user-1",
			challenge: "registration-challenge",
			kind: "registration",
			expiresAt: "2026-04-06T13:25:00.000Z",
		});
		verifyRegistrationResponseMock.mockResolvedValue({
			verified: false,
			registrationInfo: null,
		} as never);
		const service = createService({ repo, env: { ISSUER_BASE_URL: "https://auth.example.com" } as CloudflareEnv });

		await expect(
			service.verifyAndStoreRegistration("user-1", "challenge-1", {} as RegistrationResponseJSON)
		).rejects.toThrow("Passkey registration could not be verified.");
		expect(repo.insertCredential).not.toHaveBeenCalled();
	});

	it("generateAuthenticationChallenge stores a challenge with the expected ttl", async () => {
		const repo = createRepoMock();
		const siteRepo = createSiteRepoMock();
		siteRepo.get.mockResolvedValue({
			siteTitle: "Example Auth",
			siteUrl: null,
			cdnUrl: null,
			logoKey: null,
			mfaEnabled: true,
		});
		generateAuthenticationOptionsMock.mockResolvedValue({
			challenge: "authentication-challenge",
			rpId: "auth.example.com",
		} as never);
		const service = createService({ repo, siteRepo, env: { ISSUER_BASE_URL: "https://auth.example.com" } as CloudflareEnv });

		const result = await service.generateAuthenticationChallenge();

		expect(generateAuthenticationOptionsMock).toHaveBeenCalledWith({
			rpID: "auth.example.com",
			userVerification: "preferred",
			allowCredentials: [],
		});
		expect(repo.insertChallenge).toHaveBeenCalledWith({
			id: "challenge-1",
			userId: null,
			challenge: "authentication-challenge",
			kind: "authentication",
			expiresAt: "2026-04-06T13:25:00.000Z",
		});
		expect(result.challengeId).toBe("challenge-1");
	});

	it("verifyAuthentication rejects missing challenges", async () => {
		const repo = createRepoMock();
		repo.getChallengeById.mockResolvedValue(null);
		const service = createService({ repo });

		await expect(
			service.verifyAuthentication("missing", {} as AuthenticationResponseJSON)
		).rejects.toThrow("Invalid or expired authentication challenge.");
	});

	it("verifyAuthentication rejects expired challenges and deletes them", async () => {
		const repo = createRepoMock();
		repo.getChallengeById.mockResolvedValue({
			id: "challenge-2",
			userId: null,
			challenge: "authentication-challenge",
			kind: "authentication",
			expiresAt: "2026-04-06T13:19:59.000Z",
		});
		const service = createService({ repo });

		await expect(
			service.verifyAuthentication("challenge-2", {} as AuthenticationResponseJSON)
		).rejects.toThrow("Authentication challenge has expired.");
		expect(repo.deleteChallenge).toHaveBeenCalledWith("challenge-2");
	});

	it("verifyAuthentication verifies the response and returns an exchange token", async () => {
		const repo = createRepoMock();
		const siteRepo = createSiteRepoMock();
		repo.getChallengeById.mockResolvedValue({
			id: "challenge-2",
			userId: null,
			challenge: "authentication-challenge",
			kind: "authentication",
			expiresAt: "2026-04-06T13:25:00.000Z",
		});
		repo.findCredentialById.mockResolvedValue(
			makeCredentialRow({ credentialId: "credential-base64url", publicKey: "BAUG" })
		);
		siteRepo.get.mockResolvedValue({
			siteTitle: "Example Auth",
			siteUrl: null,
			cdnUrl: null,
			logoKey: null,
			mfaEnabled: true,
		});
		verifyAuthenticationResponseMock.mockResolvedValue({
			verified: true,
			authenticationInfo: { newCounter: 9 },
		} as never);
		const service = createService({ repo, siteRepo, env: { ISSUER_BASE_URL: "https://auth.sub.example.com" } as CloudflareEnv });

		const result = await service.verifyAuthentication(
			"challenge-2",
			{ id: "credential-base64url" } as AuthenticationResponseJSON
		);

		expect(verifyAuthenticationResponseMock).toHaveBeenCalledWith(
			expect.objectContaining({
				expectedChallenge: "authentication-challenge",
				expectedOrigin: "https://auth.sub.example.com",
				expectedRPID: ["auth.sub.example.com", "example.com"],
			})
		);
		expect(repo.updateCredentialCounter).toHaveBeenCalledWith("credential-base64url", 9);
		expect(repo.deleteChallenge).toHaveBeenCalledWith("challenge-2");
		expect(repo.insertExchangeToken).toHaveBeenCalledWith({
			id: "challenge-1",
			userId: "user-1",
			expiresAt: "2026-04-06T13:22:00.000Z",
			usedAt: null,
		});
		expect(result).toEqual({ exchangeToken: "challenge-1", userId: "user-1" });
	});

	it("verifyAuthentication throws when WebAuthn authentication verification fails", async () => {
		const repo = createRepoMock();
		repo.getChallengeById.mockResolvedValue({
			id: "challenge-2",
			userId: null,
			challenge: "authentication-challenge",
			kind: "authentication",
			expiresAt: "2026-04-06T13:25:00.000Z",
		});
		repo.findCredentialById.mockResolvedValue(
			makeCredentialRow({ credentialId: "credential-base64url", publicKey: "BAUG" })
		);
		verifyAuthenticationResponseMock.mockResolvedValue({
			verified: false,
			authenticationInfo: { newCounter: 9 },
		} as never);
		const service = createService({ repo, env: { ISSUER_BASE_URL: "https://auth.example.com" } as CloudflareEnv });

		await expect(
			service.verifyAuthentication("challenge-2", { id: "credential-base64url" } as AuthenticationResponseJSON)
		).rejects.toThrow("Passkey authentication could not be verified.");
		expect(repo.updateCredentialCounter).not.toHaveBeenCalled();
	});

	it("consumeExchangeToken returns the user id when present", async () => {
		const repo = createRepoMock();
		repo.consumeExchangeToken.mockResolvedValue(makeExchangeTokenRow());
		const service = createService({ repo });

		await expect(service.consumeExchangeToken("exchange-1")).resolves.toBe("user-1");
	});
});