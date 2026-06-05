import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/context/on-public-server-action", () => ({ onPublicServerAction: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn(), signOut: vi.fn() }));

import { cookies } from "next/headers";
import { onPublicServerAction } from "@/lib/context/on-public-server-action";
import { beginSignInChallenge, requestEmailMfaCode } from "@/app/actions/mfa-actions";
import { MFA_CHALLENGE_COOKIE } from "@/lib/auth/mfa-cookie";

const cookiesMock = vi.mocked(cookies);
const onPublicServerActionMock = vi.mocked(onPublicServerAction);

type User = {
	id: string;
	username: string;
	email: string | null;
	isAdmin: boolean;
	emailVerifiedAt: string | null;
};

function setup(opts: {
	user: User | null;
	site: { mfaEnabled: boolean; mfaCanEnable: boolean };
	totpEnrolled: boolean;
	passwordExpired?: boolean;
	expiredEmailSent?: boolean;
}) {
	const jar = { set: vi.fn(), delete: vi.fn(), get: vi.fn() };
	cookiesMock.mockResolvedValue(jar as never);

	const userChallengeService = {
		verifyUsernamePassword: vi.fn().mockResolvedValue(opts.user),
		createMfaOtpAndSendEmail: vi.fn().mockResolvedValue("mfa-challenge-id"),
		createEmailVerificationOtpAndSendEmail: vi.fn().mockResolvedValue("ev-challenge-id"),
		sendExpiredPasswordReset: vi.fn().mockResolvedValue(opts.expiredEmailSent ?? false),
	};
	const siteSettingsService = { get: vi.fn().mockResolvedValue(opts.site) };
	const totpService = { getStatus: vi.fn().mockResolvedValue({ enrolled: opts.totpEnrolled }) };
	const passwordPolicyService = {
		isPasswordExpiredForUser: vi.fn().mockResolvedValue(opts.passwordExpired ?? false),
	};

	const services = { userChallengeService, siteSettingsService, totpService, passwordPolicyService };
	onPublicServerActionMock.mockImplementation((fn) =>
		(fn as (ctx: unknown, get: () => unknown) => unknown)({}, () => services) as never
	);
	return { jar, userChallengeService, totpService, passwordPolicyService };
}

const baseUser: User = {
	id: "u1",
	username: "alice",
	email: "alice@example.com",
	isAdmin: false,
	emailVerifiedAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe("beginSignInChallenge — method availability", () => {
	it("offers both methods (and sends no email yet) when site MFA and TOTP are both available", async () => {
		const { jar, userChallengeService } = setup({
			user: baseUser,
			site: { mfaEnabled: true, mfaCanEnable: true },
			totpEnrolled: true,
		});
		const r = await beginSignInChallenge("alice", "pw");
		expect(r).toEqual({ ok: true, challenge: "mfa", methods: ["totp", "email"] });
		// Deferred: the email code is not sent until the user picks email.
		expect(userChallengeService.createMfaOtpAndSendEmail).not.toHaveBeenCalled();
		expect(jar.set).not.toHaveBeenCalled();
	});

	it("uses TOTP only (no email) when site MFA is off but the user enrolled an authenticator", async () => {
		const { jar, userChallengeService } = setup({
			user: baseUser,
			site: { mfaEnabled: false, mfaCanEnable: false },
			totpEnrolled: true,
		});
		const r = await beginSignInChallenge("alice", "pw");
		expect(r).toEqual({ ok: true, challenge: "mfa", methods: ["totp"] });
		expect(userChallengeService.createMfaOtpAndSendEmail).not.toHaveBeenCalled();
		expect(jar.set).not.toHaveBeenCalled();
	});

	it("sends the email code immediately when email is the only method", async () => {
		const { jar, userChallengeService } = setup({
			user: baseUser,
			site: { mfaEnabled: true, mfaCanEnable: true },
			totpEnrolled: false,
		});
		const r = await beginSignInChallenge("alice", "pw");
		expect(r).toEqual({ ok: true, challenge: "mfa", methods: ["email"] });
		expect(userChallengeService.createMfaOtpAndSendEmail).toHaveBeenCalledOnce();
		expect(jar.set).toHaveBeenCalledWith(MFA_CHALLENGE_COOKIE, "mfa-challenge-id", expect.any(Object));
	});

	it("returns challenge=none for an admin with no MFA methods", async () => {
		setup({
			user: { ...baseUser, isAdmin: true },
			site: { mfaEnabled: false, mfaCanEnable: false },
			totpEnrolled: false,
		});
		const r = await beginSignInChallenge("alice", "pw");
		expect(r).toEqual({ ok: true, challenge: "none" });
	});

	it("requires email verification for an unverified non-admin when email MFA is enabled globally", async () => {
		const { userChallengeService } = setup({
			user: { ...baseUser, emailVerifiedAt: null },
			site: { mfaEnabled: true, mfaCanEnable: true },
			totpEnrolled: false,
		});
		const r = await beginSignInChallenge("alice", "pw");
		// Email MFA is the user's sole method, so they go through the MFA challenge,
		// which also verifies email ownership on completion.
		expect(r).toEqual({ ok: true, challenge: "mfa", methods: ["email"] });
		expect(userChallengeService.createMfaOtpAndSendEmail).toHaveBeenCalledOnce();
	});

	it("signs in an unverified non-admin without email verification when email MFA is off globally", async () => {
		const { userChallengeService } = setup({
			user: { ...baseUser, emailVerifiedAt: null },
			site: { mfaEnabled: false, mfaCanEnable: false },
			totpEnrolled: false,
		});
		const r = await beginSignInChallenge("alice", "pw");
		expect(r).toEqual({ ok: true, challenge: "none" });
		expect(userChallengeService.createEmailVerificationOtpAndSendEmail).not.toHaveBeenCalled();
	});

	it("signs in a non-admin with no email address when email MFA is off globally", async () => {
		const { userChallengeService } = setup({
			user: { ...baseUser, email: null, emailVerifiedAt: null },
			site: { mfaEnabled: false, mfaCanEnable: false },
			totpEnrolled: false,
		});
		const r = await beginSignInChallenge("alice", "pw");
		expect(r).toEqual({ ok: true, challenge: "none" });
		expect(userChallengeService.createEmailVerificationOtpAndSendEmail).not.toHaveBeenCalled();
	});

	it("rejects an invalid password", async () => {
		setup({ user: null, site: { mfaEnabled: false, mfaCanEnable: false }, totpEnrolled: false });
		const r = await beginSignInChallenge("alice", "bad");
		expect(r).toEqual({ ok: false, error: "Invalid username or password." });
	});

	it("forces a password reset before MFA when the password is expired (email sent)", async () => {
		const { userChallengeService, totpService } = setup({
			user: baseUser,
			site: { mfaEnabled: true, mfaCanEnable: true },
			totpEnrolled: true,
			passwordExpired: true,
			expiredEmailSent: true,
		});
		const r = await beginSignInChallenge("alice", "pw");
		expect(r).toEqual({ ok: true, challenge: "password_expired", emailSent: true });
		expect(userChallengeService.sendExpiredPasswordReset).toHaveBeenCalledOnce();
		// Gate runs before MFA: no method evaluation, no MFA email.
		expect(totpService.getStatus).not.toHaveBeenCalled();
		expect(userChallengeService.createMfaOtpAndSendEmail).not.toHaveBeenCalled();
	});

	it("reports emailSent=false when expired but reset delivery is not configured", async () => {
		setup({
			user: baseUser,
			site: { mfaEnabled: false, mfaCanEnable: false },
			totpEnrolled: false,
			passwordExpired: true,
			expiredEmailSent: false,
		});
		const r = await beginSignInChallenge("alice", "pw");
		expect(r).toEqual({ ok: true, challenge: "password_expired", emailSent: false });
	});

	it("errors when site MFA is on but misconfigured and the user has no TOTP fallback", async () => {
		setup({
			user: baseUser,
			site: { mfaEnabled: true, mfaCanEnable: false },
			totpEnrolled: false,
		});
		const r = await beginSignInChallenge("alice", "pw");
		expect(r).toEqual({
			ok: false,
			error: "Configure Site URL and RESEND_API_KEY before using MFA.",
		});
	});
});

describe("requestEmailMfaCode", () => {
	it("sends an email code and sets the MFA cookie", async () => {
		const { jar, userChallengeService } = setup({
			user: baseUser,
			site: { mfaEnabled: true, mfaCanEnable: true },
			totpEnrolled: true,
		});
		const r = await requestEmailMfaCode("alice", "pw");
		expect(r).toEqual({ ok: true });
		expect(userChallengeService.createMfaOtpAndSendEmail).toHaveBeenCalledOnce();
		expect(jar.set).toHaveBeenCalledWith(MFA_CHALLENGE_COOKIE, "mfa-challenge-id", expect.any(Object));
	});

	it("refuses when site email MFA is unavailable", async () => {
		const { userChallengeService } = setup({
			user: baseUser,
			site: { mfaEnabled: false, mfaCanEnable: false },
			totpEnrolled: true,
		});
		const r = await requestEmailMfaCode("alice", "pw");
		expect(r).toEqual({ ok: false, error: "Email codes are not available." });
		expect(userChallengeService.createMfaOtpAndSendEmail).not.toHaveBeenCalled();
	});
});
