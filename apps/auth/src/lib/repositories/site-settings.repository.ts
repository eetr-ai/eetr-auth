export interface SiteSettingsRow {
	siteTitle: string | null;
	siteUrl: string | null;
	cdnUrl: string | null;
	logoKey: string | null;
	mfaEnabled: boolean;
	/** Password policy id applied to admin sign-in (admins have no environment). */
	adminPasswordPolicyId: string | null;
}

export interface SiteSettingsRepository {
	get(): Promise<SiteSettingsRow | null>;
	update(patch: {
		siteTitle?: string | null;
		siteUrl?: string | null;
		cdnUrl?: string | null;
		logoKey?: string | null;
		mfaEnabled?: boolean;
		adminPasswordPolicyId?: string | null;
	}): Promise<void>;
}
