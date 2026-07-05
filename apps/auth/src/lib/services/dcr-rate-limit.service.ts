import type { DcrRateLimitRepository } from "@/lib/repositories/dcr-rate-limit.repository";

export interface DcrRateLimitResult {
	/** True if this attempt is within the per-IP daily budget. */
	allowed: boolean;
	/** The configured per-day limit (echoed for the caller's error message). */
	limit: number;
	/** Running attempt count for this IP today (after recording this attempt). */
	attempts: number;
}

export interface DcrRateLimitServiceDeps {
	repo: DcrRateLimitRepository;
	limitPerDay: number;
}

/**
 * Per-IP daily rate limit for Dynamic Client Registration. This owns only the DB-backed
 * counter (repositories can't be reached from a route directly); the API route orchestrates
 * the guard — it calls {@link recordAttempt} up front and maps `allowed === false` to a 429.
 */
export class DcrRateLimitService {
	private readonly repo: DcrRateLimitRepository;
	private readonly limitPerDay: number;

	constructor({ repo, limitPerDay }: DcrRateLimitServiceDeps) {
		this.repo = repo;
		this.limitPerDay = limitPerDay;
	}

	/**
	 * Record one attempt for `ip` (today, UTC) and report whether it is within budget. Called
	 * before request validation so malformed floods still count. Behind Cloudflare
	 * CF-Connecting-IP is always present; the "unknown" bucket only applies to proxyless/local
	 * requests.
	 */
	async recordAttempt(ip: string | null): Promise<DcrRateLimitResult> {
		const day = new Date().toISOString().slice(0, 10);
		const attempts = await this.repo.incrementAndGet(ip ?? "unknown", day);
		return { allowed: attempts <= this.limitPerDay, limit: this.limitPerDay, attempts };
	}
}
