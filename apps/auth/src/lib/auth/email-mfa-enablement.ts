import type { SiteSettingsRow } from "@/lib/repositories/site-settings.repository";

/**
 * Email-based MFA and email verification share the same email infrastructure, so
 * both are only available when:
 *   1. the site has the email MFA toggle on,
 *   2. a Site URL is configured (the link target in the email), and
 *   3. a Resend API key is configured (so a code can actually be sent).
 *
 * When any of these is missing there's no way to deliver a code, so sign-in must
 * not block on a check it cannot perform. This is the single source of truth for
 * that gate, used by the credentials and passkey providers. It is equivalent to
 * `mfaEnabled && mfaCanEnable` in `SiteSettingsService` — the form
 * `beginSignInChallenge` relies on (`mfaCanEnable` already folds in the Site URL
 * and Resend key).
 */
export function isEmailMfaGloballyEnabled(
	site: Pick<SiteSettingsRow, "mfaEnabled" | "siteUrl"> | null | undefined,
	resendApiKey: string | null | undefined
): boolean {
	return (site?.mfaEnabled ?? false) && !!site?.siteUrl?.trim() && !!resendApiKey?.trim();
}
