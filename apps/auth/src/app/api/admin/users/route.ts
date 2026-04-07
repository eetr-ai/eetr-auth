import { NextResponse } from "next/server";
import { withAdminApiClientContext } from "@/lib/context/with-admin-api-client-context";

function toErrorResponse(error: unknown) {
	const message = error instanceof Error ? error.message : "Unexpected error.";
	if (message === "Username is required") {
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

export const POST = withAdminApiClientContext(async (req, _ctx, getServices) => {
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
	};

	if (typeof body.username !== "string" || body.username.trim().length === 0) {
		return NextResponse.json(
			{ error: "invalid_request", error_description: "username is required." },
			{ status: 400 }
		);
	}
	if (typeof body.password !== "string" || body.password.trim().length === 0) {
		return NextResponse.json(
			{ error: "invalid_request", error_description: "password is required." },
			{ status: 400 }
		);
	}
	if (body.isAdmin !== undefined || body.is_admin !== undefined) {
		return NextResponse.json(
			{
				error: "invalid_request",
				error_description:
					"Admin API create only supports regular users; do not send isAdmin/is_admin.",
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

	try {
		const { userService } = getServices();
		const user = await userService.createUser(
			body.username,
			body.password,
			false,
			body.name === undefined ? undefined : body.name,
			body.email === undefined ? undefined : body.email
		);
		return NextResponse.json(user, { status: 201 });
	} catch (error) {
		return toErrorResponse(error);
	}
});