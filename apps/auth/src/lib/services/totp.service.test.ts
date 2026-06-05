import { describe, expect, it, vi } from "vitest";

import type { SiteSettingsRepository, SiteSettingsRow } from "@/lib/repositories/site-settings.repository";
import type { UserTotpRepository, UserTotpRow } from "@/lib/repositories/user-totp.repository";
import { base32Decode } from "@/lib/auth/totp";
import { totpCodeAt } from "@/lib/auth/totp";
import { TotpService } from "@/lib/services/totp.service";

// In-memory TOTP repo backing a single user's enrollment.
function makeTotpRepo() {
	let row: UserTotpRow | null = null;
	const repo: UserTotpRepository = {
		get: vi.fn(async () => row),
		upsertPending: vi.fn(async ({ userId, secretEnc, createdAt }) => {
			row = { userId, secretEnc, confirmedAt: null, createdAt, lastUsedAt: null };
		}),
		confirm: vi.fn(async (_userId, iso) => {
			if (row) row.confirmedAt = iso;
		}),
		delete: vi.fn(async () => {
			row = null;
		}),
		touchLastUsed: vi.fn(async (_userId, iso) => {
			if (row) row.lastUsedAt = iso;
		}),
	};
	return { repo, peek: () => row };
}

function makeSiteRepo(siteTitle: string | null): SiteSettingsRepository {
	const settings: SiteSettingsRow = {
		siteTitle,
		siteUrl: null,
		cdnUrl: null,
		logoKey: null,
		mfaEnabled: false,
		adminPasswordPolicyId: null,
	};
	return { get: vi.fn(async () => settings), update: vi.fn(async () => {}) };
}

const USER = { id: "user-1", username: "alice", email: "alice@example.com" };

function currentStep(): number {
	return Math.floor(Date.now() / 1000 / 30);
}

describe("TotpService", () => {
	it("reports not enrolled when there is no row", async () => {
		const { repo } = makeTotpRepo();
		const svc = new TotpService({ totpRepo: repo, siteRepo: makeSiteRepo("Eetr Auth") });
		expect(await svc.getStatus(USER.id)).toEqual({ enrolled: false, createdAt: null, lastUsedAt: null });
		expect(await svc.isEnrolled(USER.id)).toBe(false);
	});

	it("beginEnrollment stores a pending (unconfirmed) row and returns QR/manual data", async () => {
		const { repo, peek } = makeTotpRepo();
		const svc = new TotpService({ totpRepo: repo, siteRepo: makeSiteRepo("Eetr Auth") });

		const { otpauthUri, secret } = await svc.beginEnrollment(USER);

		expect(secret).toMatch(/^[A-Z2-7]{32}$/);
		expect(otpauthUri).toContain(encodeURIComponent("Eetr Auth:alice@example.com"));
		expect(otpauthUri).toContain(`secret=${secret}`);
		// Stored but not yet active.
		expect(peek()?.confirmedAt).toBeNull();
		expect(await svc.isEnrolled(USER.id)).toBe(false);
	});

	it("pending enrollment is not usable for login until confirmed", async () => {
		const { repo } = makeTotpRepo();
		const svc = new TotpService({ totpRepo: repo, siteRepo: makeSiteRepo("Eetr Auth") });
		const { secret } = await svc.beginEnrollment(USER);
		const code = await totpCodeAt(secret, currentStep());
		// Correct code, but enrollment was never confirmed.
		expect(await svc.verifyCode(USER.id, code)).toBe(false);
	});

	it("confirmEnrollment activates the enrollment with a valid code", async () => {
		const { repo, peek } = makeTotpRepo();
		const svc = new TotpService({ totpRepo: repo, siteRepo: makeSiteRepo("Eetr Auth") });
		const { secret } = await svc.beginEnrollment(USER);

		const code = await totpCodeAt(secret, currentStep());
		expect(await svc.confirmEnrollment(USER.id, code)).toBe(true);
		expect(peek()?.confirmedAt).toBeTruthy();

		const status = await svc.getStatus(USER.id);
		expect(status.enrolled).toBe(true);
		expect(status.createdAt).toBeTruthy();
	});

	it("confirmEnrollment rejects a bad code and leaves the row pending", async () => {
		const { repo, peek } = makeTotpRepo();
		const svc = new TotpService({ totpRepo: repo, siteRepo: makeSiteRepo("Eetr Auth") });
		await svc.beginEnrollment(USER);

		expect(await svc.confirmEnrollment(USER.id, "000000")).toBe(false);
		expect(peek()?.confirmedAt).toBeNull();
	});

	it("verifyCode succeeds for a confirmed enrollment and records last-used", async () => {
		const { repo, peek } = makeTotpRepo();
		const svc = new TotpService({ totpRepo: repo, siteRepo: makeSiteRepo("Eetr Auth") });
		const { secret } = await svc.beginEnrollment(USER);
		await svc.confirmEnrollment(USER.id, await totpCodeAt(secret, currentStep()));

		expect(await svc.verifyCode(USER.id, await totpCodeAt(secret, currentStep()))).toBe(true);
		expect(peek()?.lastUsedAt).toBeTruthy();
		expect(await svc.verifyCode(USER.id, "000000")).toBe(false);
	});

	it("disable removes the enrollment", async () => {
		const { repo } = makeTotpRepo();
		const svc = new TotpService({ totpRepo: repo, siteRepo: makeSiteRepo("Eetr Auth") });
		const { secret } = await svc.beginEnrollment(USER);
		await svc.confirmEnrollment(USER.id, await totpCodeAt(secret, currentStep()));

		await svc.disable(USER.id);
		expect(await svc.isEnrolled(USER.id)).toBe(false);
	});

	it("falls back to a default issuer and the username when site title / email are absent", async () => {
		const { repo } = makeTotpRepo();
		const svc = new TotpService({ totpRepo: repo, siteRepo: makeSiteRepo(null) });
		const { otpauthUri, secret } = await svc.beginEnrollment({ id: "u2", username: "bob", email: null });
		expect(otpauthUri).toContain(encodeURIComponent("Eetr Auth:bob"));
		// secret is valid base32
		expect(() => base32Decode(secret)).not.toThrow();
	});
});
