export interface SiteSettingsRow {
	siteTitle: string | null;
	siteUrl: string | null;
	cdnUrl: string | null;
	logoKey: string | null;
}

export interface SiteSettingsRepository {
	get(): Promise<SiteSettingsRow | null>;
	update(patch: {
		siteTitle?: string | null;
		siteUrl?: string | null;
		cdnUrl?: string | null;
		logoKey?: string | null;
	}): Promise<void>;
}
