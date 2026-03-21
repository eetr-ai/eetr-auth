import { getDb } from "@/lib/db";
import type { RequestContext } from "@/lib/context/types";
import { SiteSettingsRepositoryD1 } from "@/lib/repositories/site-settings.repository.d1";
import { SiteAdminApiClientsRepositoryD1 } from "@/lib/repositories/site-admin-api-clients.repository.d1";
import { ClientRepositoryD1 } from "@/lib/repositories/client.repository.d1";
import { getAvatarCdnBaseUrl } from "@/lib/users/profile";

export const DEFAULT_SITE_TITLE = "Eetr Auth";
export const DEFAULT_LOGO_PATH = "/eetr-auth-logo.png";

export interface SiteSettingsDto {
	siteTitle: string | null;
	siteUrl: string | null;
	cdnUrl: string | null;
	logoKey: string | null;
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

export class SiteSettingsService {
	private readonly siteRepo: SiteSettingsRepositoryD1;
	private readonly adminClientsRepo: SiteAdminApiClientsRepositoryD1;
	private readonly clientRepo: ClientRepositoryD1;
	private readonly env: Record<string, unknown>;

	constructor(ctx: RequestContext) {
		const db = getDb(ctx.env);
		this.siteRepo = new SiteSettingsRepositoryD1(db);
		this.adminClientsRepo = new SiteAdminApiClientsRepositoryD1(db);
		this.clientRepo = new ClientRepositoryD1(db);
		this.env = ctx.env as unknown as Record<string, unknown>;
	}

	getLogoPublicUrlForKey(logoKey: string, cdnUrlOverride: string | null): string {
		const baseSource =
			normalizeOptional(cdnUrlOverride) ?? getAvatarCdnBaseUrl(this.env);
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

	async get(): Promise<SiteSettingsDto> {
		const row = await this.siteRepo.get();
		const siteTitle = row?.siteTitle ?? null;
		const siteUrl = row?.siteUrl ?? null;
		const cdnUrl = row?.cdnUrl ?? null;
		const logoKey = row?.logoKey ?? null;
		return {
			siteTitle,
			siteUrl,
			cdnUrl,
			logoKey,
			displayTitle: this.getDisplaySiteTitle(siteTitle),
			displayLogoUrl: this.getDisplayLogoUrl(logoKey, cdnUrl),
		};
	}

	async updateSiteFields(input: {
		siteTitle?: string | null;
		siteUrl?: string | null;
		cdnUrl?: string | null;
	}): Promise<SiteSettingsDto> {
		const siteTitle = input.siteTitle !== undefined ? normalizeOptional(input.siteTitle) : undefined;
		const siteUrl = input.siteUrl !== undefined ? normalizeOptional(input.siteUrl) : undefined;
		const cdnUrl = input.cdnUrl !== undefined ? normalizeOptional(input.cdnUrl) : undefined;

		if (siteUrl !== undefined) assertOptionalHttpUrl("Site URL", siteUrl);
		if (cdnUrl !== undefined) assertOptionalHttpUrl("CDN URL", cdnUrl);

		await this.siteRepo.update({
			...(siteTitle !== undefined ? { siteTitle } : {}),
			...(siteUrl !== undefined ? { siteUrl } : {}),
			...(cdnUrl !== undefined ? { cdnUrl } : {}),
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
