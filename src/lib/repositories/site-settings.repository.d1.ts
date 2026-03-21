import type {
	SiteSettingsRepository,
	SiteSettingsRow,
} from "./site-settings.repository";

const DEFAULT_ID = "default";

export class SiteSettingsRepositoryD1 implements SiteSettingsRepository {
	constructor(private readonly db: D1Database) {}

	async get(): Promise<SiteSettingsRow | null> {
		const row = await this.db
			.prepare(
				"SELECT site_title as siteTitle, site_url as siteUrl, cdn_url as cdnUrl, logo_key as logoKey FROM site_settings WHERE id = ?"
			)
			.bind(DEFAULT_ID)
			.first<{
				siteTitle: string | null;
				siteUrl: string | null;
				cdnUrl: string | null;
				logoKey: string | null;
			}>();
		return row ?? null;
	}

	async update(patch: {
		siteTitle?: string | null;
		siteUrl?: string | null;
		cdnUrl?: string | null;
		logoKey?: string | null;
	}): Promise<void> {
		const sets: string[] = [];
		const values: unknown[] = [];
		if (patch.siteTitle !== undefined) {
			sets.push("site_title = ?");
			values.push(patch.siteTitle);
		}
		if (patch.siteUrl !== undefined) {
			sets.push("site_url = ?");
			values.push(patch.siteUrl);
		}
		if (patch.cdnUrl !== undefined) {
			sets.push("cdn_url = ?");
			values.push(patch.cdnUrl);
		}
		if (patch.logoKey !== undefined) {
			sets.push("logo_key = ?");
			values.push(patch.logoKey);
		}
		if (sets.length === 0) return;
		values.push(DEFAULT_ID);
		await this.db
			.prepare(`UPDATE site_settings SET ${sets.join(", ")} WHERE id = ?`)
			.bind(...values)
			.run();
	}
}
