/**
 * Re-derives the `isAdmin` claim on a JWT session token from the current database
 * state, so that revoking a user's admin rights (or deleting the user) takes effect
 * on their existing session rather than waiting for the session to expire.
 *
 * The session uses the JWT strategy, so `isAdmin` is otherwise frozen at sign-in.
 * To avoid a database read on every request, the re-check is throttled to
 * {@link ADMIN_RECHECK_INTERVAL_MS}; staleness is therefore bounded to that window.
 */

export const ADMIN_RECHECK_INTERVAL_MS = 5 * 60 * 1000;

export interface RefreshableAdminToken {
	id?: unknown;
	isAdmin?: unknown;
	adminCheckedAt?: unknown;
}

export interface RefreshAdminClaimOptions {
	/** Current time in epoch ms (injected for testability). */
	now: number;
	/** Override the throttle window; defaults to {@link ADMIN_RECHECK_INTERVAL_MS}. */
	intervalMs?: number;
	/**
	 * Looks up the user's current admin flag. Returns `null` when the user no longer
	 * exists, in which case privileges are dropped.
	 */
	fetchIsAdmin: (userId: string) => Promise<boolean | null>;
}

export async function refreshAdminClaim<T extends RefreshableAdminToken>(
	token: T,
	opts: RefreshAdminClaimOptions
): Promise<T> {
	const intervalMs = opts.intervalMs ?? ADMIN_RECHECK_INTERVAL_MS;
	const userId = typeof token.id === "string" ? token.id : null;
	if (!userId) {
		return token;
	}
	const lastChecked = typeof token.adminCheckedAt === "number" ? token.adminCheckedAt : 0;
	if (opts.now - lastChecked < intervalMs) {
		return token;
	}

	let fresh: boolean | null;
	try {
		fresh = await opts.fetchIsAdmin(userId);
	} catch {
		// Transient failure (e.g. a DB blip): keep the prior claim and retry next request,
		// rather than locking out a legitimate admin on a momentary error. adminCheckedAt is
		// intentionally not advanced so the next request re-attempts immediately.
		return token;
	}

	// A null lookup means the user was deleted → drop privileges.
	token.isAdmin = fresh === null ? false : fresh;
	token.adminCheckedAt = opts.now;
	return token;
}
