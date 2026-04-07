import type { ClientRepository } from "@/lib/repositories/client.repository";
import type { SiteAdminApiClientsRepository } from "@/lib/repositories/site-admin-api-clients.repository";
import type { SiteSettingsRepository } from "@/lib/repositories/site-settings.repository";

export const DEFAULT_SITE_TITLE = "Eetr Auth";
export const DEFAULT_LOGO_PATH = "/eetr-auth-logo.png";

export interface SiteSettingsDto {
	siteTitle: string | null;
	siteUrl: string | null;
	cdnUrl: string | null;
	logoKey: string | null;
	mfaEnabled: boolean;
	/** True when Site URL and Resend are configured so MFA can be turned on. */
	mfaCanEnable: boolean;
	displayTitle: string;
	displayLogoUrl: string;
}

function normalizeOptional(value: string | null | undefined): string | null {
	if (value == null) return null;
	const t = value.trim();
	return t.length > 0 ? t : null;
}

function assertOptionalHttpUrl(label: string, value: string | null): void {
	if (value == null) return;
	try {
		const u = new URL(value);
		if (u.protocol !== "http:" && u.protocol !== "https:") {
			throw new Error(`${label} must be an http(s) URL`);
		}
	} catch (e) {
		if (e instanceof TypeError) {
			throw new Error(`${label} must be a valid http(s) URL`);
		}
		throw e;
	}
}

export interface SiteSettingsServiceDependencies {
	siteRepo: SiteSettingsRepository;
	adminClientsRepo: SiteAdminApiClientsRepository;
	clientRepo: ClientRepository;
	avatarCdnBaseUrl: string;
	resendApiKey: string | null;
}

export class SiteSettingsService {
	private readonly siteRepo: SiteSettingsRepository;
	private readonly adminClientsRepo: SiteAdminApiClientsRepository;
	private readonly clientRepo: ClientRepository;
	private readonly avatarCdnBaseUrl: string;
	private readonly resendApiKey: string | null;

	constructor({
		siteRepo,
		adminClientsRepo,
		clientRepo,
		avatarCdnBaseUrl,
		resendApiKey,
	}: SiteSettingsServiceDependencies) {
		this.siteRepo = siteRepo;
		this.adminClientsRepo = adminClientsRepo;
		this.clientRepo = clientRepo;
		this.avatarCdnBaseUrl = avatarCdnBaseUrl.replace(/\/+$/, "");
		this.resendApiKey = resendApiKey;
	}

	getLogoPublicUrlForKey(logoKey: string, cdnUrlOverride: string | null): string {
		const baseSource = normalizeOptional(cdnUrlOverride) ?? this.avatarCdnBaseUrl;
		const base = baseSource.replace(/\/+$/, "");
		const key = logoKey.replace(/^\/+/, "");
		return `${base}/${key}`;
	}

	getDisplaySiteTitle(siteTitle: string | null | undefined): string {
		const n = normalizeOptional(siteTitle);
		return n ?? DEFAULT_SITE_TITLE;
	}

	getDisplayLogoUrl(logoKey: string | null | undefined, cdnUrlOverride: string | null): string {
		const key = normalizeOptional(logoKey);
		if (!key) return DEFAULT_LOGO_PATH;
		return this.getLogoPublicUrlForKey(key, cdnUrlOverride);
	}

	/** Absolute URL for `<img src>` in HTML emails (uploaded logo via CDN, or default asset on site origin). */
	getEmailLogoAbsoluteUrl(siteUrlHttp: string, logoKey: string | null, cdnUrlOverride: string | null): string {
		const raw = siteUrlHttp.trim();
		const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
		const key = normalizeOptional(logoKey);
		if (!key) {
			return `${u.origin}${DEFAULT_LOGO_PATH}`;
		}
		return this.getLogoPublicUrlForKey(key, cdnUrlOverride);
	}

	private computeMfaCanEnable(siteUrl: string | null): boolean {
		return !!(normalizeOptional(siteUrl) && this.resendApiKey);
	}

	async get(): Promise<SiteSettingsDto> {
		const row = await this.siteRepo.get();
		const siteTitle = row?.siteTitle ?? null;
		const siteUrl = row?.siteUrl ?? null;
		const cdnUrl = row?.cdnUrl ?? null;
		const logoKey = row?.logoKey ?? null;
		const mfaEnabled = row?.mfaEnabled ?? false;
		const mfaCanEnable = this.computeMfaCanEnable(siteUrl);
		return {
			siteTitle,
			siteUrl,
			cdnUrl,
			logoKey,
			mfaEnabled,
			mfaCanEnable,
			displayTitle: this.getDisplaySiteTitle(siteTitle),
			displayLogoUrl: this.getDisplayLogoUrl(logoKey, cdnUrl),
		};
	}

	async updateSiteFields(input: {
		siteTitle?: string | null;
		siteUrl?: string | null;
		cdnUrl?: string | null;
		mfaEnabled?: boolean;
	}): Promise<SiteSettingsDto> {
		const current = await this.siteRepo.get();
		const siteTitle = input.siteTitle !== undefined ? normalizeOptional(input.siteTitle) : undefined;
		const siteUrl = input.siteUrl !== undefined ? normalizeOptional(input.siteUrl) : undefined;
		const cdnUrl = input.cdnUrl !== undefined ? normalizeOptional(input.cdnUrl) : undefined;

		if (siteUrl !== undefined) assertOptionalHttpUrl("Site URL", siteUrl);
		if (cdnUrl !== undefined) assertOptionalHttpUrl("CDN URL", cdnUrl);

		const nextSiteUrl = siteUrl !== undefined ? siteUrl : current?.siteUrl ?? null;
		const nextMfaEnabled =
			input.mfaEnabled !== undefined ? input.mfaEnabled : current?.mfaEnabled ?? false;

		if (input.mfaEnabled === true) {
			if (!normalizeOptional(nextSiteUrl)) {
				throw new Error("Configure Site URL before enabling MFA.");
			}
			if (!this.resendApiKey) {
				throw new Error("RESEND_API_KEY is not configured; cannot enable MFA.");
			}
		}

		if (normalizeOptional(nextSiteUrl) === null && nextMfaEnabled) {
			throw new Error("Clear MFA before removing Site URL.");
		}

		if (siteUrl !== undefined && normalizeOptional(siteUrl) === null && (current?.mfaEnabled ?? false)) {
			throw new Error("Disable MFA before clearing Site URL.");
		}

		await this.siteRepo.update({
			...(siteTitle !== undefined ? { siteTitle } : {}),
			...(siteUrl !== undefined ? { siteUrl } : {}),
			...(cdnUrl !== undefined ? { cdnUrl } : {}),
			...(input.mfaEnabled !== undefined ? { mfaEnabled: input.mfaEnabled } : {}),
		});
		return this.get();
	}

	async setLogoKey(logoKey: string | null): Promise<SiteSettingsDto> {
		await this.siteRepo.update({ logoKey: logoKey === null ? null : logoKey.trim() || null });
		return this.get();
	}

	async getAdminApiClientRowIds(): Promise<string[]> {
		return this.adminClientsRepo.listClientRowIds();
	}

	async setAdminApiClientRowIds(ids: string[]): Promise<void> {
		const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
		for (const id of unique) {
			const client = await this.clientRepo.getById(id);
			if (!client) {
				throw new Error(`Unknown client: ${id}`);
			}
		}
		await this.adminClientsRepo.setClientRowIds(unique);
	}
}
