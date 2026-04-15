import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SiteSettingsRepository } from "@/lib/repositories/site-settings.repository";
import type { SiteAdminApiClientsRepository } from "@/lib/repositories/site-admin-api-clients.repository";
import type { ClientRepository } from "@/lib/repositories/client.repository";
import { DEFAULT_LOGO_PATH, DEFAULT_SITE_TITLE, SiteSettingsService } from "@/lib/services/site-settings.service";

function createSiteRepoMock(): SiteSettingsRepository {
	return { get: vi.fn(), update: vi.fn() };
}

function createAdminClientsRepoMock(): SiteAdminApiClientsRepository {
	return { listClientRowIds: vi.fn(), setClientRowIds: vi.fn() };
}

function createClientRepoMock(): ClientRepository {
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
	};
}

function createService(
	siteRepo: SiteSettingsRepository,
	adminClientsRepo: SiteAdminApiClientsRepository,
	clientRepo: ClientRepository,
	options: { avatarCdnBaseUrl?: string; resendApiKey?: string | null; authUrl?: string } = {}
): SiteSettingsService {
	return new SiteSettingsService({
		siteRepo,
		adminClientsRepo,
		clientRepo,
		avatarCdnBaseUrl: options.avatarCdnBaseUrl ?? "https://cdn.example.com",
		resendApiKey: options.resendApiKey ?? null,
		authUrl: options.authUrl ?? "https://auth.example.com",
	});
}

describe("SiteSettingsService", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("getDisplaySiteTitle", () => {
		it("returns the default title when siteTitle is null", () => {
			const service = createService(createSiteRepoMock(), createAdminClientsRepoMock(), createClientRepoMock());
			expect(service.getDisplaySiteTitle(null)).toBe(DEFAULT_SITE_TITLE);
		});

		it("returns the default title when siteTitle is empty/whitespace", () => {
			const service = createService(createSiteRepoMock(), createAdminClientsRepoMock(), createClientRepoMock());
			expect(service.getDisplaySiteTitle("   ")).toBe(DEFAULT_SITE_TITLE);
		});

		it("returns the provided site title when it is set", () => {
			const service = createService(createSiteRepoMock(), createAdminClientsRepoMock(), createClientRepoMock());
			expect(service.getDisplaySiteTitle("My Auth")).toBe("My Auth");
		});
	});

	describe("getDisplayLogoUrl", () => {
		it("returns the default logo path when logoKey is null", () => {
			const service = createService(createSiteRepoMock(), createAdminClientsRepoMock(), createClientRepoMock());
			expect(service.getDisplayLogoUrl(null, null)).toBe(DEFAULT_LOGO_PATH);
		});

		it("returns the CDN URL when a logoKey is set", () => {
			const service = createService(createSiteRepoMock(), createAdminClientsRepoMock(), createClientRepoMock());
			expect(service.getDisplayLogoUrl("logo.png", null)).toBe("https://cdn.example.com/logo.png");
		});

		it("uses the cdnUrlOverride when provided", () => {
			const service = createService(createSiteRepoMock(), createAdminClientsRepoMock(), createClientRepoMock());
			expect(service.getDisplayLogoUrl("logo.png", "https://other-cdn.com")).toBe(
				"https://other-cdn.com/logo.png"
			);
		});
	});

	describe("getEmailLogoAbsoluteUrl", () => {
		it("returns the default logo on the auth origin when no logoKey is set", () => {
			const service = createService(createSiteRepoMock(), createAdminClientsRepoMock(), createClientRepoMock());
			expect(service.getEmailLogoAbsoluteUrl(null, null)).toBe(
				`https://auth.example.com${DEFAULT_LOGO_PATH}`
			);
		});

		it("returns the CDN URL when a logoKey is set", () => {
			const service = createService(createSiteRepoMock(), createAdminClientsRepoMock(), createClientRepoMock());
			expect(service.getEmailLogoAbsoluteUrl("logo.png", null)).toBe(
				"https://cdn.example.com/logo.png"
			);
		});

		it("prepends https when authUrl has no protocol", () => {
			const service = createService(
				createSiteRepoMock(),
				createAdminClientsRepoMock(),
				createClientRepoMock(),
				{ authUrl: "auth.example.com" }
			);
			expect(service.getEmailLogoAbsoluteUrl(null, null)).toBe(
				`https://auth.example.com${DEFAULT_LOGO_PATH}`
			);
		});
	});

	describe("get", () => {
		it("returns defaults when no settings row exists", async () => {
			const siteRepo = createSiteRepoMock();
			vi.mocked(siteRepo.get).mockResolvedValue(null);
			const service = createService(siteRepo, createAdminClientsRepoMock(), createClientRepoMock());

			const result = await service.get();
			expect(result.siteTitle).toBeNull();
			expect(result.siteUrl).toBeNull();
			expect(result.mfaEnabled).toBe(false);
			expect(result.mfaCanEnable).toBe(false);
			expect(result.displayTitle).toBe(DEFAULT_SITE_TITLE);
			expect(result.displayLogoUrl).toBe(DEFAULT_LOGO_PATH);
		});

		it("returns mfaCanEnable=true when siteUrl and RESEND_API_KEY are set", async () => {
			const siteRepo = createSiteRepoMock();
			vi.mocked(siteRepo.get).mockResolvedValue({
				siteTitle: "Auth",
				siteUrl: "https://auth.example.com",
				cdnUrl: null,
				logoKey: null,
				mfaEnabled: false,
			});
			const service = createService(siteRepo, createAdminClientsRepoMock(), createClientRepoMock(), {
				resendApiKey: "re_key_123",
			});

			const result = await service.get();
			expect(result.mfaCanEnable).toBe(true);
		});
	});

	describe("updateSiteFields", () => {
		it("throws when siteUrl is not a valid http(s) URL", async () => {
			const siteRepo = createSiteRepoMock();
			vi.mocked(siteRepo.get).mockResolvedValue(null);
			const service = createService(siteRepo, createAdminClientsRepoMock(), createClientRepoMock());

			await expect(service.updateSiteFields({ siteUrl: "not-a-url" })).rejects.toThrow(
				"Site URL must be a valid http(s) URL"
			);
		});

		it("throws when siteUrl uses a non-http protocol", async () => {
			const siteRepo = createSiteRepoMock();
			vi.mocked(siteRepo.get).mockResolvedValue(null);
			const service = createService(siteRepo, createAdminClientsRepoMock(), createClientRepoMock());

			await expect(service.updateSiteFields({ siteUrl: "ftp://example.com" })).rejects.toThrow(
				"Site URL must be an http(s) URL"
			);
		});

		it("throws when enabling MFA without a siteUrl configured", async () => {
			const siteRepo = createSiteRepoMock();
			vi.mocked(siteRepo.get).mockResolvedValue(null);
			const service = createService(siteRepo, createAdminClientsRepoMock(), createClientRepoMock(), {
				resendApiKey: "re_key",
			});

			await expect(service.updateSiteFields({ mfaEnabled: true })).rejects.toThrow(
				"Configure Site URL before enabling MFA."
			);
		});

		it("throws when enabling MFA without RESEND_API_KEY", async () => {
			const siteRepo = createSiteRepoMock();
			vi.mocked(siteRepo.get).mockResolvedValue({
				siteTitle: null,
				siteUrl: "https://auth.example.com",
				cdnUrl: null,
				logoKey: null,
				mfaEnabled: false,
			});
			const service = createService(siteRepo, createAdminClientsRepoMock(), createClientRepoMock());

			await expect(
				service.updateSiteFields({ siteUrl: "https://auth.example.com", mfaEnabled: true })
			).rejects.toThrow("RESEND_API_KEY is not configured");
		});

		it("throws when clearing siteUrl while MFA is enabled", async () => {
			const siteRepo = createSiteRepoMock();
			vi.mocked(siteRepo.get).mockResolvedValue({
				siteTitle: null,
				siteUrl: "https://auth.example.com",
				cdnUrl: null,
				logoKey: null,
				mfaEnabled: true,
			});
			const service = createService(siteRepo, createAdminClientsRepoMock(), createClientRepoMock());

			await expect(service.updateSiteFields({ siteUrl: null })).rejects.toThrow(
				"Clear MFA before removing Site URL."
			);
		});

		it("saves changes when inputs are valid", async () => {
			const siteRepo = createSiteRepoMock();
			vi.mocked(siteRepo.get)
				.mockResolvedValueOnce(null)
				.mockResolvedValueOnce({ siteTitle: "Auth", siteUrl: null, cdnUrl: null, logoKey: null, mfaEnabled: false });
			const service = createService(siteRepo, createAdminClientsRepoMock(), createClientRepoMock());

			await service.updateSiteFields({ siteTitle: "Auth" });
			expect(siteRepo.update).toHaveBeenCalledWith(expect.objectContaining({ siteTitle: "Auth" }));
		});
	});

	describe("setLogoKey", () => {
		it("stores null when logoKey is null", async () => {
			const siteRepo = createSiteRepoMock();
			vi.mocked(siteRepo.get).mockResolvedValue(null);
			const service = createService(siteRepo, createAdminClientsRepoMock(), createClientRepoMock());

			await service.setLogoKey(null);
			expect(siteRepo.update).toHaveBeenCalledWith({ logoKey: null });
		});

		it("trims and stores the logo key", async () => {
			const siteRepo = createSiteRepoMock();
			vi.mocked(siteRepo.get).mockResolvedValue(null);
			const service = createService(siteRepo, createAdminClientsRepoMock(), createClientRepoMock());

			await service.setLogoKey("  logo.png  ");
			expect(siteRepo.update).toHaveBeenCalledWith({ logoKey: "logo.png" });
		});
	});

	describe("getAdminApiClientRowIds", () => {
		it("delegates to the admin clients repo", async () => {
			const adminRepo = createAdminClientsRepoMock();
			vi.mocked(adminRepo.listClientRowIds).mockResolvedValue(["id-1", "id-2"]);
			const service = createService(createSiteRepoMock(), adminRepo, createClientRepoMock());

			await expect(service.getAdminApiClientRowIds()).resolves.toEqual(["id-1", "id-2"]);
		});
	});

	describe("setAdminApiClientRowIds", () => {
		it("throws when a referenced client does not exist", async () => {
			const clientRepo = createClientRepoMock();
			vi.mocked(clientRepo.getById).mockResolvedValue(null);
			const service = createService(createSiteRepoMock(), createAdminClientsRepoMock(), clientRepo);

			await expect(service.setAdminApiClientRowIds(["unknown-id"])).rejects.toThrow(
				"Unknown client: unknown-id"
			);
		});

		it("persists unique, trimmed IDs when all clients are valid", async () => {
			const clientRepo = createClientRepoMock();
			const adminRepo = createAdminClientsRepoMock();
			vi.mocked(clientRepo.getById).mockResolvedValue({
				id: "id-1",
				clientId: "c1",
				clientSecret: "s",
				environmentId: "e1",
				createdBy: "u1",
				expiresAt: null,
				name: null,
			});
			const service = createService(createSiteRepoMock(), adminRepo, clientRepo);

			await service.setAdminApiClientRowIds(["id-1", "id-1", "  id-1  "]);
			expect(adminRepo.setClientRowIds).toHaveBeenCalledWith(["id-1"]);
		});
	});
});
