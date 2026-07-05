export interface DcrRateLimitRepository {
	/**
	 * Record one registration attempt for `ip` on `day` (a 'YYYY-MM-DD' UTC string) and
	 * return the running attempt count for that (ip, day). Used to enforce the per-IP daily
	 * Dynamic Client Registration limit.
	 */
	incrementAndGet(ip: string, day: string): Promise<number>;
	/** Prune rows for days strictly before `day`. Returns how many rows were removed. */
	deleteOlderThan(day: string): Promise<number>;
}
