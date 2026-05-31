"use server";

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
}) {
	return onAdminServerAction(async (_ctx, getServices) => {
		const { siteSettingsService } = getServices();
		return siteSettingsService.updateSiteFields(input);
	});
}

export async function getAdminApiClientRowIds() {
	return onAdminServerAction(async (_ctx, getServices) => {
		const { siteSettingsService } = getServices();
		return siteSettingsService.getAdminApiClientRowIds();
	});
}

export async function setAdminApiClientRowIds(rowIds: string[]) {
	return onAdminServerAction(async (_ctx, getServices) => {
		const { siteSettingsService } = getServices();
		await siteSettingsService.setAdminApiClientRowIds(rowIds);
	});
}

export async function clearSiteLogo() {
	return onAdminServerAction(async (_ctx, getServices) => {
		const { siteSettingsService } = getServices();
		return siteSettingsService.setLogoKey(null);
	});
}
