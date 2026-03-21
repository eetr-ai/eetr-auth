import { cache } from "react";
import { buildRequestContext } from "@/lib/context/build-context";
import { getServices } from "@/lib/services/registry";
import {
	DEFAULT_SITE_TITLE,
	DEFAULT_LOGO_PATH,
	type SiteSettingsDto,
} from "@/lib/services/site-settings.service";

/**
 * Site identity for unauthenticated server-rendered pages (e.g. sign-in).
 * Does not use onServerAction; safe to call when no session exists.
 * Cached per request (shared with generateMetadata on the same page).
 */
export const getPublicSiteSettings = cache(async (): Promise<SiteSettingsDto> => {
	try {
		const ctx = await buildRequestContext();
		const { siteSettingsService } = getServices(ctx);
		return await siteSettingsService.get();
	} catch {
		return {
			siteTitle: null,
			siteUrl: null,
			cdnUrl: null,
			logoKey: null,
			displayTitle: DEFAULT_SITE_TITLE,
			displayLogoUrl: DEFAULT_LOGO_PATH,
		};
	}
});
