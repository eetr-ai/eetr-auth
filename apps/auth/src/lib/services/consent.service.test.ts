import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ConsentRepository } from "@/lib/repositories/consent.repository";
import type { RefreshTokenRepository } from "@/lib/repositories/refresh-token.repository";
import type { TokenRepository } from "@/lib/repositories/token.repository";
import type { AuthorizationCodeRepository } from "@/lib/repositories/authorization-code.repository";
import type { AdminAuditLogRepository } from "@/lib/repositories/admin-audit-log.repository";
import { ConsentService } from "@/lib/services/consent.service";
import { AdminAuditLogService } from "@/lib/services/admin-audit-log.service";

function createConsentRepoMock(): ConsentRepository {
	return {
		get: vi.fn().mockResolvedValue(null),
		listByUser: vi.fn().mockResolvedValue([]),
		upsert: vi.fn(),
		delete: vi.fn().mockResolvedValue(true),
	};
}

function createRefreshTokenRepoMock(): RefreshTokenRepository {
	return {
		createRefreshToken: vi.fn(),
		getByTokenId: vi.fn(),
		revoke: vi.fn(),
		revokeFamily: vi.fn(),
		listFamilyAccessTokenIds: vi.fn(),
		revokeAllForSubjectAndClient: vi.fn().mockResolvedValue([]),
		listRefreshTokenActivity: vi.fn(),
		deleteByTokenId: vi.fn(),
		deleteExpired: vi.fn(),
		deleteRevoked: vi.fn(),
	} as unknown as RefreshTokenRepository;
}

function createTokenRepoMock(): TokenRepository {
	return {
		createAccessToken: vi.fn(),
		getClientScopeGrants: vi.fn(),
		getClientScopeGrantsByNames: vi.fn(),
		getAccessTokenByTokenId: vi.fn(),
		listAccessTokenActivity: vi.fn(),
		revokeAccessTokenByTokenId: vi.fn(),
		expireAccessTokensByIds: vi.fn().mockResolvedValue(0),
		deleteAccessTokenByTokenId: vi.fn(),
		deleteExpiredAccessTokens: vi.fn(),
	} as unknown as TokenRepository;
}

function createAuthorizationCodeRepoMock(): AuthorizationCodeRepository {
	return {
		create: vi.fn(),
		getByCodeId: vi.fn(),
		markUsed: vi.fn(),
		deleteUnusedForSubjectAndClient: vi.fn().mockResolvedValue(0),
		deleteUsedOrExpired: vi.fn(),
	} as unknown as AuthorizationCodeRepository;
}

function createAuditLogService(insert = vi.fn()): AdminAuditLogService {
	const logRepo: AdminAuditLogRepository = { insert, listLogs: vi.fn() };
	return new AdminAuditLogService({ logRepo });
}

interface Mocks {
	consentRepo: ConsentRepository;
	refreshTokenRepo: RefreshTokenRepository;
	tokenRepo: TokenRepository;
	authorizationCodeRepo: AuthorizationCodeRepository;
}

function createService(
	mocks: Mocks,
	adminAuditLogService: AdminAuditLogService = createAuditLogService()
): ConsentService {
	return new ConsentService({ ...mocks, adminAuditLogService });
}

describe("ConsentService", () => {
	let mocks: Mocks;

	beforeEach(() => {
		mocks = {
			consentRepo: createConsentRepoMock(),
			refreshTokenRepo: createRefreshTokenRepoMock(),
			tokenRepo: createTokenRepoMock(),
			authorizationCodeRepo: createAuthorizationCodeRepoMock(),
		};
		vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("new-consent-id");
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("getUnconsentedScopeNames", () => {
		it("returns everything when the user has never consented", async () => {
			const service = createService(mocks);
			await expect(
				service.getUnconsentedScopeNames("u1", "c1", ["openid", "email"])
			).resolves.toEqual(["openid", "email"]);
		});

		it("returns nothing when the stored consent already covers the request", async () => {
			vi.mocked(mocks.consentRepo.get).mockResolvedValue({
				id: "k1",
				userId: "u1",
				clientId: "c1",
				scopeNames: ["email", "openid", "profile"],
				createdAt: "t",
				updatedAt: "t",
			});
			const service = createService(mocks);
			await expect(
				service.getUnconsentedScopeNames("u1", "c1", ["openid", "email"])
			).resolves.toEqual([]);
		});

		it("returns only the scopes that are new, for incremental consent", async () => {
			vi.mocked(mocks.consentRepo.get).mockResolvedValue({
				id: "k1",
				userId: "u1",
				clientId: "c1",
				scopeNames: ["openid"],
				createdAt: "t",
				updatedAt: "t",
			});
			const service = createService(mocks);
			await expect(
				service.getUnconsentedScopeNames("u1", "c1", ["openid", "email"])
			).resolves.toEqual(["email"]);
		});
	});

	describe("record", () => {
		it("creates a sorted consent set on first consent", async () => {
			const service = createService(mocks);
			await service.record("u1", "c1", ["profile", "openid"]);
			expect(mocks.consentRepo.upsert).toHaveBeenCalledWith(
				expect.objectContaining({
					id: "new-consent-id",
					userId: "u1",
					clientId: "c1",
					scopeNames: ["openid", "profile"],
				})
			);
		});

		it("merges into the existing set rather than replacing it", async () => {
			vi.mocked(mocks.consentRepo.get).mockResolvedValue({
				id: "k1",
				userId: "u1",
				clientId: "c1",
				scopeNames: ["openid"],
				createdAt: "t",
				updatedAt: "t",
			});
			const service = createService(mocks);
			await service.record("u1", "c1", ["email"]);
			expect(mocks.consentRepo.upsert).toHaveBeenCalledWith(
				expect.objectContaining({ id: "k1", scopeNames: ["email", "openid"] })
			);
		});

		it("de-duplicates when the same scope is consented again", async () => {
			vi.mocked(mocks.consentRepo.get).mockResolvedValue({
				id: "k1",
				userId: "u1",
				clientId: "c1",
				scopeNames: ["openid", "email"],
				createdAt: "t",
				updatedAt: "t",
			});
			const service = createService(mocks);
			await service.record("u1", "c1", ["openid"]);
			expect(mocks.consentRepo.upsert).toHaveBeenCalledWith(
				expect.objectContaining({ scopeNames: ["email", "openid"] })
			);
		});
	});

	describe("revoke", () => {
		it("also kills the live credentials, not just the record", async () => {
			vi.mocked(mocks.refreshTokenRepo.revokeAllForSubjectAndClient).mockResolvedValue([
				"at-1",
				"at-2",
			]);
			vi.mocked(mocks.tokenRepo.expireAccessTokensByIds).mockResolvedValue(2);
			vi.mocked(mocks.authorizationCodeRepo.deleteUnusedForSubjectAndClient).mockResolvedValue(1);

			const service = createService(mocks);
			const result = await service.revoke("u1", "c1");

			expect(mocks.consentRepo.delete).toHaveBeenCalledWith("u1", "c1");
			expect(mocks.refreshTokenRepo.revokeAllForSubjectAndClient).toHaveBeenCalledWith(
				"u1",
				"c1",
				expect.any(String)
			);
			expect(mocks.tokenRepo.expireAccessTokensByIds).toHaveBeenCalledWith(
				["at-1", "at-2"],
				expect.any(String)
			);
			expect(result).toEqual({ ok: true, accessTokensExpired: 2, codesDeleted: 1 });
		});

		it("skips the access-token expiry query when no refresh tokens were revoked", async () => {
			const service = createService(mocks);
			const result = await service.revoke("u1", "c1");
			expect(mocks.tokenRepo.expireAccessTokensByIds).not.toHaveBeenCalled();
			expect(result.accessTokensExpired).toBe(0);
		});

		it("writes a consent.revoke audit entry capturing what was withdrawn", async () => {
			vi.mocked(mocks.consentRepo.get).mockResolvedValue({
				id: "k1",
				userId: "u1",
				clientId: "c1",
				scopeNames: ["email", "openid"],
				createdAt: "t",
				updatedAt: "t",
			});
			const insert = vi.fn();
			const service = createService(mocks, createAuditLogService(insert));
			await service.revoke("u1", "c1", "admin-1");
			expect(insert).toHaveBeenCalledWith(
				expect.objectContaining({
					actor_user_id: "admin-1",
					action: "consent.revoke",
					resource_type: "consent",
					resource_id: "c1",
					details: JSON.stringify({
						userId: "u1",
						scopeNames: ["email", "openid"],
						hadConsentRecord: true,
						accessTokensExpired: 0,
						codesDeleted: 0,
					}),
				})
			);
		});

		it("still cleans up credentials when there was no consent record", async () => {
			vi.mocked(mocks.consentRepo.delete).mockResolvedValue(false);
			const service = createService(mocks);
			const result = await service.revoke("u1", "c1");
			expect(mocks.refreshTokenRepo.revokeAllForSubjectAndClient).toHaveBeenCalled();
			expect(result.ok).toBe(true);
		});
	});
});
