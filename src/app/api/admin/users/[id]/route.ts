import { NextResponse } from "next/server";
import { withAdminApiClientContext } from "@/lib/context/with-admin-api-client-context";

function parseOptionalBoolean(value: unknown): boolean | undefined | "invalid" {
	if (value === undefined || value === null) {
		return undefined;
	}
	if (typeof value === "boolean") {
		return value;
	}
	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		if (["true", "1", "yes", "on"].includes(normalized)) {
			return true;
		}
		if (["false", "0", "no", "off"].includes(normalized)) {
			return false;
		}
		return "invalid";
	}
	if (typeof value === "number") {
		if (value === 1) return true;
		if (value === 0) return false;
		return "invalid";
	}
	return "invalid";
}

function getUserIdFromPath(pathname: string): string | null {
	const parts = pathname.split("/").filter(Boolean);
	if (parts.length < 4) {
		return null;
	}
	const userId = decodeURIComponent(parts[3] ?? "").trim();
	return userId.length > 0 ? userId : null;
}

function toErrorResponse(error: unknown) {
	const message = error instanceof Error ? error.message : "Unexpected error.";
	if (message === "User not found") {
		return NextResponse.json(
			{ error: "not_found", error_description: message },
			{ status: 404 }
		);
	}
	if (
		message === "Username is required" ||
		message === "You cannot remove your own admin access" ||
		message === "Cannot remove the last admin" ||
		message === "You cannot delete your own user" ||
		message === "Cannot delete the last admin"
	) {
		return NextResponse.json(
			{ error: "invalid_request", error_description: message },
			{ status: 400 }
		);
	}
	if (/unique constraint/i.test(message)) {
		return NextResponse.json(
			{ error: "conflict", error_description: "Username or email already exists." },
			{ status: 409 }
		);
	}
	return NextResponse.json(
		{ error: "server_error", error_description: message },
		{ status: 500 }
	);
}

export const PUT = withAdminApiClientContext(async (req, _ctx, getServices, auth) => {
	const userId = getUserIdFromPath(req.nextUrl.pathname);
	if (!userId) {
		return NextResponse.json(
			{ error: "invalid_request", error_description: "User id path parameter is required." },
			{ status: 400 }
		);
	}

	let payload: unknown;
	try {
		payload = await req.json();
	} catch {
		return NextResponse.json(
			{ error: "invalid_request", error_description: "Request body must be valid JSON." },
			{ status: 400 }
		);
	}

	const body = payload as {
		username?: unknown;
		password?: unknown;
		isAdmin?: unknown;
		is_admin?: unknown;
		name?: unknown;
		email?: unknown;
		emailVerifiedAt?: unknown;
		email_verified_at?: unknown;
	};
	const parsedIsAdmin =
		body.isAdmin !== undefined
			? parseOptionalBoolean(body.isAdmin)
			: parseOptionalBoolean(body.is_admin);
	const parsedEmailVerifiedAt =
		body.emailVerifiedAt !== undefined ? body.emailVerifiedAt : body.email_verified_at;

	if (body.username !== undefined && typeof body.username !== "string") {
		return NextResponse.json(
			{ error: "invalid_request", error_description: "username must be a string when provided." },
			{ status: 400 }
		);
	}
	if (body.password !== undefined && typeof body.password !== "string") {
		return NextResponse.json(
			{ error: "invalid_request", error_description: "password must be a string when provided." },
			{ status: 400 }
		);
	}
	if (parsedIsAdmin === "invalid") {
		return NextResponse.json(
			{
				error: "invalid_request",
				error_description:
					"isAdmin/is_admin must be a boolean (or true/false, 1/0) when provided.",
			},
			{ status: 400 }
		);
	}
	if (body.name !== undefined && body.name !== null && typeof body.name !== "string") {
		return NextResponse.json(
			{ error: "invalid_request", error_description: "name must be a string or null when provided." },
			{ status: 400 }
		);
	}
	if (body.email !== undefined && body.email !== null && typeof body.email !== "string") {
		return NextResponse.json(
			{ error: "invalid_request", error_description: "email must be a string or null when provided." },
			{ status: 400 }
		);
	}
	if (
		parsedEmailVerifiedAt !== undefined &&
		parsedEmailVerifiedAt !== null &&
		typeof parsedEmailVerifiedAt !== "string"
	) {
		return NextResponse.json(
			{
				error: "invalid_request",
				error_description: "emailVerifiedAt/email_verified_at must be a string or null when provided.",
			},
			{ status: 400 }
		);
	}

	if (
		body.username === undefined &&
		body.password === undefined &&
		parsedIsAdmin === undefined &&
		body.name === undefined &&
		body.email === undefined &&
		parsedEmailVerifiedAt === undefined
	) {
		return NextResponse.json(
			{ error: "invalid_request", error_description: "At least one updatable field is required." },
			{ status: 400 }
		);
	}

	try {
		const { userService } = getServices();
		const actorUserId = auth.subjectUserId ?? `client:${auth.adminClientRowId}`;
		const user = await userService.updateUser(
			userId,
			{
				...(body.username !== undefined ? { username: body.username } : {}),
				...(body.password !== undefined ? { password: body.password } : {}),
				...(typeof parsedIsAdmin === "boolean" ? { isAdmin: parsedIsAdmin } : {}),
				...(body.name !== undefined ? { name: body.name } : {}),
				...(body.email !== undefined ? { email: body.email } : {}),
				...(parsedEmailVerifiedAt !== undefined ? { emailVerifiedAt: parsedEmailVerifiedAt } : {}),
			},
			actorUserId
		);
		return NextResponse.json(user, { status: 200 });
	} catch (error) {
		return toErrorResponse(error);
	}
});

export const DELETE = withAdminApiClientContext(async (req, _ctx, getServices, auth) => {
	const userId = getUserIdFromPath(req.nextUrl.pathname);
	if (!userId) {
		return NextResponse.json(
			{ error: "invalid_request", error_description: "User id path parameter is required." },
			{ status: 400 }
		);
	}

	try {
		const { userService } = getServices();
		const actorUserId = auth.subjectUserId ?? `client:${auth.adminClientRowId}`;
		await userService.deleteUser(userId, actorUserId);
		return NextResponse.json({ ok: true }, { status: 200 });
	} catch (error) {
		return toErrorResponse(error);
	}
});