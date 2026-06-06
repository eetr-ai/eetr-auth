import { describe, expect, it, vi } from "vitest";
import {
	ADMIN_RECHECK_INTERVAL_MS,
	refreshAdminClaim,
	type RefreshableAdminToken,
} from "./session-admin-refresh";

function makeToken(overrides?: Partial<RefreshableAdminToken>): RefreshableAdminToken {
	return { id: "user-1", isAdmin: true, adminCheckedAt: 0, ...overrides };
}

describe("refreshAdminClaim", () => {
	it("skips the DB re-check while within the throttle window", async () => {
		const fetchIsAdmin = vi.fn();
		const token = makeToken({ adminCheckedAt: 1_000 });
		const result = await refreshAdminClaim(token, {
			now: 1_000 + ADMIN_RECHECK_INTERVAL_MS - 1,
			fetchIsAdmin,
		});
		expect(fetchIsAdmin).not.toHaveBeenCalled();
		expect(result.isAdmin).toBe(true);
		expect(result.adminCheckedAt).toBe(1_000);
	});

	it("downgrades isAdmin to false when the user was demoted, and stamps the check time", async () => {
		const fetchIsAdmin = vi.fn().mockResolvedValue(false);
		const now = ADMIN_RECHECK_INTERVAL_MS + 5_000;
		const result = await refreshAdminClaim(makeToken(), { now, fetchIsAdmin });
		expect(fetchIsAdmin).toHaveBeenCalledWith("user-1");
		expect(result.isAdmin).toBe(false);
		expect(result.adminCheckedAt).toBe(now);
	});

	it("drops privileges when the user no longer exists (null lookup)", async () => {
		const fetchIsAdmin = vi.fn().mockResolvedValue(null);
		const now = ADMIN_RECHECK_INTERVAL_MS + 1;
		const result = await refreshAdminClaim(makeToken(), { now, fetchIsAdmin });
		expect(result.isAdmin).toBe(false);
		expect(result.adminCheckedAt).toBe(now);
	});

	it("keeps the prior claim and does not advance the check time on a transient failure", async () => {
		const fetchIsAdmin = vi.fn().mockRejectedValue(new Error("db down"));
		const result = await refreshAdminClaim(makeToken({ adminCheckedAt: 0 }), {
			now: ADMIN_RECHECK_INTERVAL_MS + 1,
			fetchIsAdmin,
		});
		expect(result.isAdmin).toBe(true);
		expect(result.adminCheckedAt).toBe(0); // not advanced → retried next request
	});

	it("is a no-op for a token without a user id", async () => {
		const fetchIsAdmin = vi.fn();
		const token = makeToken({ id: undefined });
		const result = await refreshAdminClaim(token, { now: 10 ** 12, fetchIsAdmin });
		expect(fetchIsAdmin).not.toHaveBeenCalled();
		expect(result).toBe(token);
	});

	it("re-checks when the token has never been checked (adminCheckedAt absent)", async () => {
		const fetchIsAdmin = vi.fn().mockResolvedValue(true);
		// Real epoch `now` is always far larger than the interval, so an absent
		// adminCheckedAt (treated as 0) always falls outside the throttle window.
		const now = 1_900_000_000_000;
		const result = await refreshAdminClaim(makeToken({ adminCheckedAt: undefined, isAdmin: false }), {
			now,
			fetchIsAdmin,
		});
		expect(fetchIsAdmin).toHaveBeenCalledOnce();
		expect(result.isAdmin).toBe(true);
		expect(result.adminCheckedAt).toBe(now);
	});
});
