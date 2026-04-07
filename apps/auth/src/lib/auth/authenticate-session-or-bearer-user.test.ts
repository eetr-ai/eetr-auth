import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));

vi.mock("@/auth", () => ({
	auth: authMock,
}));

import { authenticateSessionOrBearerUser } from "@/lib/auth/authenticate-session-or-bearer-user";

function makeReq(authorization?: string): Request {
	const headers = authorization ? { authorization } : undefined;
	return new Request("https://auth.test.local/resource", { headers });
}

describe("authenticateSessionOrBearerUser", () => {
	beforeEach(() => {
		authMock.mockReset();
	});

	it("returns 401 when bearer token is not a JWT-like value", async () => {
		const validateAccessToken = vi.fn();
		const result = await authenticateSessionOrBearerUser(makeReq("Bearer not-a-jwt"), () => ({
			oauthTokenService: { validateAccessToken },
		}) as never);

		expect("response" in result).toBe(true);
		if ("response" in result) {
			expect(result.response.status).toBe(401);
			await expect(result.response.json()).resolves.toMatchObject({
				error: "invalid_token",
				error_description: "A valid JWT access token is required.",
			});
		}
		expect(validateAccessToken).not.toHaveBeenCalled();
	});

	it("returns 401 when bearer JWT validation fails", async () => {
		const validateAccessToken = vi.fn(async () => ({ valid: false, subject: null }));
		const result = await authenticateSessionOrBearerUser(makeReq("Bearer a.b.c"), () => ({
			oauthTokenService: { validateAccessToken },
		}) as never);

		expect("response" in result).toBe(true);
		if ("response" in result) {
			expect(result.response.status).toBe(401);
			await expect(result.response.json()).resolves.toMatchObject({
				error_description: "Invalid or expired access token.",
			});
		}
		expect(validateAccessToken).toHaveBeenCalledWith("a.b.c", [], null);
	});

	it("returns bearer user when JWT validation succeeds", async () => {
		const validateAccessToken = vi.fn(async () => ({ valid: true, subject: "user-123" }));
		const result = await authenticateSessionOrBearerUser(makeReq("Bearer a.b.c"), () => ({
			oauthTokenService: { validateAccessToken },
		}) as never);

		expect(result).toEqual({
			user: {
				userId: "user-123",
				isAdmin: false,
				authMethod: "bearer",
			},
		});
	});

	it("falls back to session auth when authorization scheme is not bearer", async () => {
		authMock.mockResolvedValue({
			user: { id: "session-user", isAdmin: true },
		});

		const validateAccessToken = vi.fn();
		const result = await authenticateSessionOrBearerUser(makeReq("Basic token"), () => ({
			oauthTokenService: { validateAccessToken },
		}) as never);

		expect(result).toEqual({
			user: {
				userId: "session-user",
				isAdmin: true,
				authMethod: "session",
			},
		});
		expect(validateAccessToken).not.toHaveBeenCalled();
	});

	it("returns 401 when no bearer token and no session user id", async () => {
		authMock.mockResolvedValue({ user: {} });

		const result = await authenticateSessionOrBearerUser(makeReq(), () => ({
			oauthTokenService: { validateAccessToken: vi.fn() },
		}) as never);

		expect("response" in result).toBe(true);
		if ("response" in result) {
			expect(result.response.status).toBe(401);
			await expect(result.response.json()).resolves.toMatchObject({
				error_description: "A valid access token or session is required.",
			});
		}
	});
});
