import type { ClientRepository } from "@/lib/repositories/client.repository";
import type { PasswordPolicyRepository } from "@/lib/repositories/password-policy.repository";
import type { SiteAdminApiClientsRepository } from "@/lib/repositories/site-admin-api-clients.repository";
import type { SiteSettingsRepository } from "@/lib/repositories/site-settings.repository";
import type { AdminAuditLogService } from "./admin-audit-log.service";
import { AUDIT_ACTION, AUDIT_RESOURCE } from "./audit-actions";
import {
	StagedUploadError,
	extensionOfStagedKey,
	promoteStagedUpload,
	type AssetBucket,
} from "@/lib/uploads/staged-upload";

export const DEFAULT_SITE_TITLE = "Eetr Auth";
export const DEFAULT_LOGO_PATH = "/eetr-auth-logo.png";

export interface SiteSettingsDto {
	siteTitle: string | null;
	siteUrl: string | null;
	cdnUrl: string | null;
	logoKey: string | null;
	mfaEnabled: boolean;
	/** Password policy applied to admin sign-in, or null when none is selected. */
	adminPasswordPolicyId: string | null;
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
	passwordPolicyRepo: PasswordPolicyRepository;
	adminAuditLogService: AdminAuditLogService;
	avatarCdnBaseUrl: string;
	/** R2 bucket holding the site logo. */
	assetBucket?: AssetBucket;
	resendApiKey: string | null;
	authUrl: string;
}

export class SiteSettingsService {
	private readonly siteRepo: SiteSettingsRepository;
	private readonly adminClientsRepo: SiteAdminApiClientsRepository;
	private readonly clientRepo: ClientRepository;
	private readonly passwordPolicyRepo: PasswordPolicyRepository;
	private readonly adminAuditLogService: AdminAuditLogService;
	private readonly assetBucket?: AssetBucket;
	private readonly avatarCdnBaseUrl: string;
	private readonly resendApiKey: string | null;
	private readonly authUrl: string;

	constructor({
		siteRepo,
		adminClientsRepo,
		clientRepo,
		passwordPolicyRepo,
		adminAuditLogService,
		avatarCdnBaseUrl,
		assetBucket,
		resendApiKey,
		authUrl,
	}: SiteSettingsServiceDependencies) {
		this.siteRepo = siteRepo;
		this.adminClientsRepo = adminClientsRepo;
		this.clientRepo = clientRepo;
		this.passwordPolicyRepo = passwordPolicyRepo;
		this.adminAuditLogService = adminAuditLogService;
		this.assetBucket = assetBucket;
		this.avatarCdnBaseUrl = avatarCdnBaseUrl.replace(/\/+$/, "");
		this.resendApiKey = resendApiKey;
		this.authUrl = authUrl.trim().replace(/\/+$/, "");
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

	/** Absolute URL for `<img src>` in HTML emails (uploaded logo via CDN, or default asset on the auth origin). */
	getEmailLogoAbsoluteUrl(logoKey: string | null, cdnUrlOverride: string | null): string {
		const key = normalizeOptional(logoKey);
		if (!key) {
			const raw = this.authUrl;
			const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
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
		const adminPasswordPolicyId = row?.adminPasswordPolicyId ?? null;
		const mfaCanEnable = this.computeMfaCanEnable(siteUrl);
		return {
			siteTitle,
			siteUrl,
			cdnUrl,
			logoKey,
			mfaEnabled,
			adminPasswordPolicyId,
			mfaCanEnable,
			displayTitle: this.getDisplaySiteTitle(siteTitle),
			displayLogoUrl: this.getDisplayLogoUrl(logoKey, cdnUrl),
		};
	}

	async updateSiteFields(
		input: {
			siteTitle?: string | null;
			siteUrl?: string | null;
			cdnUrl?: string | null;
			mfaEnabled?: boolean;
			adminPasswordPolicyId?: string | null;
		},
		actorUserId: string | null = null
	): Promise<SiteSettingsDto> {
		const current = await this.siteRepo.get();
		const siteTitle = input.siteTitle !== undefined ? normalizeOptional(input.siteTitle) : undefined;
		const siteUrl = input.siteUrl !== undefined ? normalizeOptional(input.siteUrl) : undefined;
		const cdnUrl = input.cdnUrl !== undefined ? normalizeOptional(input.cdnUrl) : undefined;
		const adminPasswordPolicyId =
			input.adminPasswordPolicyId !== undefined
				? normalizeOptional(input.adminPasswordPolicyId)
				: undefined;

		if (siteUrl !== undefined) assertOptionalHttpUrl("Site URL", siteUrl);
		if (cdnUrl !== undefined) assertOptionalHttpUrl("CDN URL", cdnUrl);
		if (adminPasswordPolicyId != null) {
			const policy = await this.passwordPolicyRepo.getById(adminPasswordPolicyId);
			if (!policy) {
				throw new Error("Selected admin password policy no longer exists.");
			}
		}

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
			...(adminPasswordPolicyId !== undefined ? { adminPasswordPolicyId } : {}),
		});
		const changedFields = [
			...(siteTitle !== undefined ? ["siteTitle"] : []),
			...(siteUrl !== undefined ? ["siteUrl"] : []),
			...(cdnUrl !== undefined ? ["cdnUrl"] : []),
			...(input.mfaEnabled !== undefined ? ["mfaEnabled"] : []),
			...(adminPasswordPolicyId !== undefined ? ["adminPasswordPolicyId"] : []),
		];
		if (changedFields.length > 0) {
			await this.adminAuditLogService.logAction({
				actorUserId,
				action: AUDIT_ACTION.siteSettingsUpdate,
				resourceType: AUDIT_RESOURCE.siteSettings,
				details: {
					changedFields,
					...(siteTitle !== undefined ? { siteTitle } : {}),
					...(siteUrl !== undefined ? { siteUrl } : {}),
					...(cdnUrl !== undefined ? { cdnUrl } : {}),
					...(input.mfaEnabled !== undefined ? { mfaEnabled: input.mfaEnabled } : {}),
					...(adminPasswordPolicyId !== undefined ? { adminPasswordPolicyId } : {}),
				},
			});
		}
		return this.get();
	}

	/**
	 * Promotes a staged logo and records it. Called when the Setup form saves,
	 * not when the file is picked, so cancelling leaves the live logo alone.
	 */
	async promoteStagedLogo(
		stagedKey: string,
		actorUserId: string | null = null
	): Promise<SiteSettingsDto> {
		if (!this.assetBucket) {
			throw new StagedUploadError("Logo storage is not configured.");
		}
		const finalKey = `site/logo.${extensionOfStagedKey(stagedKey)}`;
		await promoteStagedUpload(this.assetBucket, stagedKey, finalKey);
		return this.setLogoKey(finalKey, actorUserId);
	}

	async setLogoKey(logoKey: string | null, actorUserId: string | null = null): Promise<SiteSettingsDto> {
		const nextLogoKey = logoKey === null ? null : logoKey.trim() || null;
		await this.siteRepo.update({ logoKey: nextLogoKey });
		await this.adminAuditLogService.logAction({
			actorUserId,
			action: AUDIT_ACTION.siteLogoUpdate,
			resourceType: AUDIT_RESOURCE.siteSettings,
			details: { logoKey: nextLogoKey, cleared: nextLogoKey === null },
		});
		return this.get();
	}

	async getAdminApiClientRowIds(): Promise<string[]> {
		return this.adminClientsRepo.listClientRowIds();
	}

	async setAdminApiClientRowIds(ids: string[], actorUserId: string | null = null): Promise<void> {
		const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
		for (const id of unique) {
			const client = await this.clientRepo.getById(id);
			if (!client) {
				throw new Error(`Unknown client: ${id}`);
			}
		}
		await this.adminClientsRepo.setClientRowIds(unique);
		await this.adminAuditLogService.logAction({
			actorUserId,
			action: AUDIT_ACTION.siteAdminApiClientsUpdate,
			resourceType: AUDIT_RESOURCE.siteSettings,
			details: { clientRowIds: unique },
		});
	}
}
