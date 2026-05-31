import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("./build-context", () => ({ buildRequestContext: vi.fn() }));
vi.mock("@/lib/services/registry", () => ({ getServices: vi.fn() }));

import { auth } from "@/auth";
import { buildRequestContext } from "./build-context";
import { getServices } from "@/lib/services/registry";
import { onServerAction, onAdminServerAction } from "./on-server-action";

const authMock = vi.mocked(auth);
const buildRequestContextMock = vi.mocked(buildRequestContext);
const getServicesMock = vi.mocked(getServices);

const fakeCtx = { env: {} } as never;
const fakeServices = { marker: "services" } as never;

function mockSession(user: { id: string; isAdmin: boolean } | null) {
	authMock.mockResolvedValue((user ? { user } : null) as never);
}

beforeEach(() => {
	vi.clearAllMocks();
	buildRequestContextMock.mockResolvedValue(fakeCtx);
	getServicesMock.mockReturnValue(fakeServices);
});

describe("onServerAction", () => {
	it("runs the callback with context and services for any signed-in user", async () => {
		mockSession({ id: "u1", isAdmin: false });
		const fn = vi.fn().mockResolvedValue("result");

		const out = await onServerAction(fn);

		expect(out).toBe("result");
		expect(fn).toHaveBeenCalledOnce();
		const [ctxArg, getServicesArg] = fn.mock.calls[0];
		expect(ctxArg).toBe(fakeCtx);
		expect(getServicesArg()).toBe(fakeServices);
	});

	it("throws Unauthorized and never runs the callback when there is no session", async () => {
		mockSession(null);
		const fn = vi.fn();

		await expect(onServerAction(fn)).rejects.toThrow("Unauthorized");
		expect(fn).not.toHaveBeenCalled();
		expect(buildRequestContextMock).not.toHaveBeenCalled();
	});
});

describe("onAdminServerAction", () => {
	it("runs the callback for an admin session", async () => {
		mockSession({ id: "admin1", isAdmin: true });
		const fn = vi.fn().mockResolvedValue("admin-result");

		const out = await onAdminServerAction(fn);

		expect(out).toBe("admin-result");
		expect(fn).toHaveBeenCalledOnce();
		const [ctxArg, getServicesArg] = fn.mock.calls[0];
		expect(ctxArg).toBe(fakeCtx);
		expect(getServicesArg()).toBe(fakeServices);
	});

	it("throws Forbidden and never runs the callback for a signed-in non-admin", async () => {
		mockSession({ id: "u1", isAdmin: false });
		const fn = vi.fn();

		await expect(onAdminServerAction(fn)).rejects.toThrow("Forbidden");
		expect(fn).not.toHaveBeenCalled();
		expect(buildRequestContextMock).not.toHaveBeenCalled();
	});

	it("treats a missing isAdmin flag as non-admin (fail closed)", async () => {
		authMock.mockResolvedValue({ user: { id: "u1" } } as never);
		const fn = vi.fn();

		await expect(onAdminServerAction(fn)).rejects.toThrow("Forbidden");
		expect(fn).not.toHaveBeenCalled();
	});

	it("throws Unauthorized and never runs the callback when there is no session", async () => {
		mockSession(null);
		const fn = vi.fn();

		await expect(onAdminServerAction(fn)).rejects.toThrow("Unauthorized");
		expect(fn).not.toHaveBeenCalled();
		expect(buildRequestContextMock).not.toHaveBeenCalled();
	});
});
