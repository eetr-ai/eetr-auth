/**
 * Derives a friendly, human-readable label for a passkey from the User-Agent of the
 * request that registered it, e.g. "Chrome on macOS" or "Safari on iPhone". This is only
 * a default suggestion — the user can rename the passkey afterwards. It is best-effort:
 * User-Agent strings are not reliable, so we fall back to a generic label.
 */
export function deviceNameFromUserAgent(ua: string | null | undefined): string {
	const fallback = "New passkey";
	if (!ua) return fallback;

	const os = detectOs(ua);
	const browser = detectBrowser(ua);

	if (browser && os) return `${browser} on ${os}`;
	if (browser) return browser;
	if (os) return `Passkey on ${os}`;
	return fallback;
}

function detectOs(ua: string): string | null {
	// Order matters: iPadOS/iOS report "like Mac OS X"; Android reports "Linux".
	if (/iPhone/i.test(ua)) return "iPhone";
	if (/iPad/i.test(ua)) return "iPad";
	if (/Android/i.test(ua)) return "Android";
	if (/Windows NT/i.test(ua)) return "Windows";
	if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
	if (/CrOS/i.test(ua)) return "ChromeOS";
	if (/Linux/i.test(ua)) return "Linux";
	return null;
}

function detectBrowser(ua: string): string | null {
	// Order matters: most browsers embed "Safari"/"Chrome" tokens, so check the more
	// specific brands first.
	if (/Edg\//i.test(ua)) return "Edge";
	if (/OPR\/|Opera/i.test(ua)) return "Opera";
	if (/Firefox\//i.test(ua)) return "Firefox";
	if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) return "Chrome";
	if (/Chromium\//i.test(ua)) return "Chromium";
	// Safari has no "Chrome"/"Chromium" token but does have "Version/".
	if (/Safari\//i.test(ua) && /Version\//i.test(ua)) return "Safari";
	return null;
}
