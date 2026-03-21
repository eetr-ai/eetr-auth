"use server";

import { onServerAction } from "@/lib/context/on-server-action";

export async function getSiteSettings() {
	return onServerAction(async (_ctx, getServices) => {
		const { siteSettingsService } = getServices();
		return siteSettingsService.get();
	});
}

export async function updateSiteSettings(input: {
	siteTitle?: string | null;
	siteUrl?: string | null;
	cdnUrl?: string | null;
}) {
	return onServerAction(async (_ctx, getServices) => {
		const { siteSettingsService } = getServices();
		return siteSettingsService.updateSiteFields(input);
	});
}

export async function getAdminApiClientRowIds() {
	return onServerAction(async (_ctx, getServices) => {
		const { siteSettingsService } = getServices();
		return siteSettingsService.getAdminApiClientRowIds();
	});
}

export async function setAdminApiClientRowIds(rowIds: string[]) {
	return onServerAction(async (_ctx, getServices) => {
		const { siteSettingsService } = getServices();
		await siteSettingsService.setAdminApiClientRowIds(rowIds);
	});
}

export async function clearSiteLogo() {
	return onServerAction(async (_ctx, getServices) => {
		const { siteSettingsService } = getServices();
		return siteSettingsService.setLogoKey(null);
	});
}
