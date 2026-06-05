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
				"SELECT site_title as siteTitle, site_url as siteUrl, cdn_url as cdnUrl, logo_key as logoKey, mfa_enabled as mfaEnabled, admin_password_policy_id as adminPasswordPolicyId FROM site_settings WHERE id = ?"
			)
			.bind(DEFAULT_ID)
			.first<{
				siteTitle: string | null;
				siteUrl: string | null;
				cdnUrl: string | null;
				logoKey: string | null;
				mfaEnabled: number | null;
				adminPasswordPolicyId: string | null;
			}>();
		if (!row) return null;
		return {
			...row,
			mfaEnabled: !!row.mfaEnabled,
		};
	}

	async update(patch: {
		siteTitle?: string | null;
		siteUrl?: string | null;
		cdnUrl?: string | null;
		logoKey?: string | null;
		mfaEnabled?: boolean;
		adminPasswordPolicyId?: string | null;
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
		if (patch.mfaEnabled !== undefined) {
			sets.push("mfa_enabled = ?");
			values.push(patch.mfaEnabled ? 1 : 0);
		}
		if (patch.adminPasswordPolicyId !== undefined) {
			sets.push("admin_password_policy_id = ?");
			values.push(patch.adminPasswordPolicyId);
		}
		if (sets.length === 0) return;
		values.push(DEFAULT_ID);
		await this.db
			.prepare(`UPDATE site_settings SET ${sets.join(", ")} WHERE id = ?`)
			.bind(...values)
			.run();
	}
}
