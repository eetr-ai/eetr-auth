/**
 * In-memory cache for scope names used by .well-known discovery endpoints.
 * Reduces DB load from repeated or abusive requests; TTL matches response Cache-Control.
 */
const TTL_MS = 300_000; // 5 minutes, aligned with max-age=300 on discovery responses

let cached: { scopeNames: string[]; expiresAt: number } | null = null;

/**
 * Returns scope names for discovery metadata, from cache when valid or by calling the fetcher.
 */
export async function getCachedScopeNames(
	fetch: () => Promise<{ scopeName: string }[]>
): Promise<string[]> {
	const now = Date.now();
	if (cached && cached.expiresAt > now) {
		return cached.scopeNames;
	}
	const list = await fetch();
	const scopeNames = list.map((s) => s.scopeName);
	cached = { scopeNames, expiresAt: now + TTL_MS };
	return scopeNames;
}
