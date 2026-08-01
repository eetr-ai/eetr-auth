/**
 * Loopback URI handling for OAuth parameters that carry a URL inside the query string
 * (`redirect_uri`, `resource`).
 *
 * Two independent reasons force us to treat the loopback host as fungible:
 *
 * 1. RFC 8252 §7.3 — native clients spell the loopback interface as `localhost`,
 *    `127.0.0.1`, or `[::1]` interchangeably, and the one they register is not always the
 *    one they later request.
 * 2. Next.js rewrites loopback hosts to `localhost` across the *entire* request URL string,
 *    not just its hostname (`REGEX_LOCALHOST_HOSTNAME` in
 *    `next/dist/server/web/next-url.js`). A `redirect_uri=http://127.0.0.1:5173/cb` query
 *    parameter therefore reaches a route handler already rewritten to `localhost`, while the
 *    same URI sent in a JSON or form body (registration, token exchange) arrives untouched.
 *    Comparing the two byte-for-byte fails through no fault of the client.
 *
 * Only the host is treated as equivalent. Scheme, port, path, and query still have to match
 * exactly, so this cannot make a non-loopback URI match a loopback one.
 */

/** 127.0.0.0/8 — the whole IPv4 loopback block, matching what Next.js rewrites. */
const LOOPBACK_IPV4 = /^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/;

/**
 * Whether `hostname` addresses the local machine. Accepts `localhost`, any 127.0.0.0/8
 * address, and the IPv6 loopback (WHATWG `URL.hostname` keeps IPv6 literals bracketed).
 */
export function isLoopbackHostname(hostname: string): boolean {
	const host = hostname.toLowerCase();
	return host === "localhost" || host === "[::1]" || host === "::1" || LOOPBACK_IPV4.test(host);
}

/**
 * Collapse a loopback URI's host to `localhost` so every spelling of the local machine
 * compares equal. Non-loopback URIs, and anything that isn't a parsable absolute URL, are
 * returned untouched.
 *
 * Every loopback URI is re-serialized through `URL`, including one already on `localhost`.
 * Skipping that for the already-canonical host would be an asymmetry, not an optimization:
 * the WHATWG serializer appends `/` to a pathless URL and drops a default port, so
 * `http://127.0.0.1:3000` would normalize to `http://localhost:3000/` while
 * `http://localhost:3000` stayed as-is, and the two would no longer compare equal. Both
 * sides therefore have to take the same path.
 */
export function canonicalizeLoopbackUri(value: string): string {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return value;
	}
	if (!isLoopbackHostname(url.hostname)) {
		return value;
	}
	url.hostname = "localhost";
	return url.toString();
}

/**
 * Resolve `requested` against a client's registered redirect URIs, returning the **registered**
 * URI that matched, or null when none did.
 *
 * The registered form is deliberately what comes back: it is the URI the client actually told
 * us about, so it is what the authorization code should be bound to and where the browser
 * should be sent. Returning the requested form instead would persist a host the client never
 * registered, and the token exchange — whose `redirect_uri` arrives in an unmangled request
 * body — would then fail to match the code.
 */
export function matchRegisteredRedirectUri(
	requested: string,
	registered: readonly string[]
): string | null {
	if (registered.includes(requested)) return requested;
	const target = canonicalizeLoopbackUri(requested);
	for (const candidate of registered) {
		if (canonicalizeLoopbackUri(candidate) === target) return candidate;
	}
	return null;
}
