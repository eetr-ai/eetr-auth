import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/context/on-server-action", () => ({ onServerAction: vi.fn() }));

import { auth } from "@/auth";
import { onServerAction } from "@/lib/context/on-server-action";
import {
	beginTotpEnrollment,
	confirmTotpEnrollment,
	disableTotp,
	getTotpStatus,
} from "@/app/actions/totp-actions";

const authMock = vi.mocked(auth);
const onServerActionMock = vi.mocked(onServerAction);

const SESSION = { user: { id: "user-1", username: "alice", email: "alice@example.com" } };

function wireServices(totpService: Record<string, unknown>) {
	// Stand in for onServerAction: run the callback with a fake getServices().
	onServerActionMock.mockImplementation((fn) =>
		(fn as (ctx: unknown, get: () => unknown) => unknown)({}, () => ({ totpService })) as never
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	authMock.mockResolvedValue(SESSION as never);
});

describe("totp-actions auth guard", () => {
	it("rejects when there is no session", async () => {
		authMock.mockResolvedValue(null as never);
		await expect(getTotpStatus()).rejects.toThrow("Unauthorized");
	});
});

describe("getTotpStatus", () => {
	it("delegates to the service for the session user", async () => {
		const status = { enrolled: true, createdAt: "2026-01-01", lastUsedAt: null };
		const getStatus = vi.fn().mockResolvedValue(status);
		wireServices({ getStatus });
		await expect(getTotpStatus()).resolves.toEqual(status);
		expect(getStatus).toHaveBeenCalledWith("user-1");
	});
});

describe("beginTotpEnrollment", () => {
	it("passes the session user's id/username/email to the service", async () => {
		const beginEnrollment = vi.fn().mockResolvedValue({ otpauthUri: "otpauth://x", secret: "S" });
		wireServices({ beginEnrollment });
		await expect(beginTotpEnrollment()).resolves.toEqual({ otpauthUri: "otpauth://x", secret: "S" });
		expect(beginEnrollment).toHaveBeenCalledWith({
			id: "user-1",
			username: "alice",
			email: "alice@example.com",
		});
	});
});

describe("confirmTotpEnrollment", () => {
	it("returns ok when the service confirms", async () => {
		const confirmEnrollment = vi.fn().mockResolvedValue(true);
		wireServices({ confirmEnrollment });
		await expect(confirmTotpEnrollment("123456")).resolves.toEqual({ ok: true });
		expect(confirmEnrollment).toHaveBeenCalledWith("user-1", "123456");
	});

	it("throws a friendly error when the code does not match", async () => {
		wireServices({ confirmEnrollment: vi.fn().mockResolvedValue(false) });
		await expect(confirmTotpEnrollment("000000")).rejects.toThrow(/didn't match/i);
	});
});

describe("disableTotp", () => {
	it("delegates removal to the service", async () => {
		const disable = vi.fn().mockResolvedValue(undefined);
		wireServices({ disable });
		await expect(disableTotp()).resolves.toEqual({ ok: true });
		expect(disable).toHaveBeenCalledWith("user-1");
	});
});
