export interface SiteSettingsRow {
	siteTitle: string | null;
	siteUrl: string | null;
	cdnUrl: string | null;
	logoKey: string | null;
	mfaEnabled: boolean;
}

export interface SiteSettingsRepository {
	get(): Promise<SiteSettingsRow | null>;
	update(patch: {
		siteTitle?: string | null;
		siteUrl?: string | null;
		cdnUrl?: string | null;
		logoKey?: string | null;
		mfaEnabled?: boolean;
	}): Promise<void>;
}
