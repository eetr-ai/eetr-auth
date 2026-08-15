"use server";

import { auth } from "@/auth";
import { onAdminServerAction } from "@/lib/context/on-server-action";

export async function getSiteSettings() {
	return onAdminServerAction(async (_ctx, getServices) => {
		const { siteSettingsService } = getServices();
		return siteSettingsService.get();
	});
}

export async function updateSiteSettings(input: {
	siteTitle?: string | null;
	siteUrl?: string | null;
	cdnUrl?: string | null;
	mfaEnabled?: boolean;
	adminPasswordPolicyId?: string | null;
	/** A `staging/` key from the logo upload endpoint, promoted as part of this save. */
	logoStagedKey?: string | null;
}) {
	const session = await auth();
	const actorUserId = session?.user?.id ?? null;
	return onAdminServerAction(async (_ctx, getServices) => {
		const { siteSettingsService } = getServices();
		const { logoStagedKey, ...fields } = input;
		const dto = await siteSettingsService.updateSiteFields(fields, actorUserId);
		// Promotion runs after the field save so a rejected logo cannot silently
		// discard the rest of the form's changes.
		if (logoStagedKey) {
			return siteSettingsService.promoteStagedLogo(logoStagedKey, actorUserId);
		}
		return dto;
	});
}

export async function getAdminApiClientRowIds() {
	return onAdminServerAction(async (_ctx, getServices) => {
		const { siteSettingsService } = getServices();
		return siteSettingsService.getAdminApiClientRowIds();
	});
}

export async function setAdminApiClientRowIds(rowIds: string[]) {
	const session = await auth();
	const actorUserId = session?.user?.id ?? null;
	return onAdminServerAction(async (_ctx, getServices) => {
		const { siteSettingsService } = getServices();
		await siteSettingsService.setAdminApiClientRowIds(rowIds, actorUserId);
	});
}

export async function clearSiteLogo() {
	const session = await auth();
	const actorUserId = session?.user?.id ?? null;
	return onAdminServerAction(async (_ctx, getServices) => {
		const { siteSettingsService } = getServices();
		return siteSettingsService.setLogoKey(null, actorUserId);
	});
}
