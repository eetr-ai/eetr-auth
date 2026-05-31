import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/context/on-server-action", () => ({ onAdminServerAction: vi.fn() }));

import { auth } from "@/auth";
import { onAdminServerAction } from "@/lib/context/on-server-action";
import { updateUser } from "@/app/actions/user-actions";

const authMock = vi.mocked(auth);
const onAdminServerActionMock = vi.mocked(onAdminServerAction);

beforeEach(() => {
	vi.clearAllMocks();
	authMock.mockResolvedValue({ user: { id: "actor-1" } } as never);
});

describe("updateUser action — field whitelist", () => {
	it("forwards only known fields and drops anything unexpected", async () => {
		const userService = { updateUser: vi.fn().mockResolvedValue({ id: "user-1" }) };
		onAdminServerActionMock.mockImplementation((fn) =>
			(fn as (ctx: unknown, get: () => unknown) => unknown)({}, () => ({ userService })) as never
		);

		await updateUser("user-1", {
			username: "alice",
			isAdmin: true,
			// A crafted RPC body could include columns the action never meant to expose.
			createdAt: "1999-01-01T00:00:00.000Z",
			id: "spoofed",
		} as never);

		expect(userService.updateUser).toHaveBeenCalledWith(
			"user-1",
			{ username: "alice", isAdmin: true },
			"actor-1"
		);
		const forwarded = userService.updateUser.mock.calls[0]?.[1] as Record<string, unknown>;
		expect(forwarded).not.toHaveProperty("createdAt");
		expect(forwarded).not.toHaveProperty("id");
	});

	it("throws Unauthorized without a session and never reaches the service", async () => {
		authMock.mockResolvedValue(null as never);
		await expect(updateUser("user-1", { username: "alice" })).rejects.toThrow("Unauthorized");
		expect(onAdminServerActionMock).not.toHaveBeenCalled();
	});
});
