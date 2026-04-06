import { NextResponse } from "next/server";
import { authenticateSessionOrBearerUser } from "@/lib/auth/authenticate-session-or-bearer-user";
import { withApiContext } from "@/lib/context/with-api-context";

type UpdateCurrentUserBody = {
	name?: unknown;
	email?: unknown;
	[key: string]: unknown;
};

const ALLOWED_FIELDS = new Set(["name", "email"]);

function toErrorResponse(error: unknown) {
	const message = error instanceof Error ? error.message : "Unexpected error.";
	if (message === "User not found") {
		return NextResponse.json(
			{ error: "not_found", error_description: message },
			{ status: 404 }
		);
	}
	if (/unique constraint/i.test(message)) {
		return NextResponse.json(
			{ error: "conflict", error_description: "Email already exists." },
			{ status: 409 }
		);
	}
	return NextResponse.json(
		{ error: "server_error", error_description: message },
		{ status: 500 }
	);
}

export const PATCH = withApiContext(async (req, _ctx, getServices) => {
	const authResult = await authenticateSessionOrBearerUser(req, getServices);
	if ("response" in authResult) {
		return authResult.response;
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

	if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
		return NextResponse.json(
			{ error: "invalid_request", error_description: "Request body must be a JSON object." },
			{ status: 400 }
		);
	}

	const body = payload as UpdateCurrentUserBody;
	const unsupportedFields = Object.keys(body).filter((key) => !ALLOWED_FIELDS.has(key));
	if (unsupportedFields.length > 0) {
		return NextResponse.json(
			{
				error: "invalid_request",
				error_description: `Unsupported field(s): ${unsupportedFields.join(", ")}. Only name and email may be updated.`,
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
	if (body.name === undefined && body.email === undefined) {
		return NextResponse.json(
			{ error: "invalid_request", error_description: "At least one updatable field is required." },
			{ status: 400 }
		);
	}

	try {
		const { userService } = getServices();
		const actorUserId = authResult.user.userId;
		const user = await userService.updateUser(
			actorUserId,
			{
				...(body.name !== undefined ? { name: body.name as string | null } : {}),
				...(body.email !== undefined ? { email: body.email as string | null } : {}),
			},
			actorUserId
		);
		return NextResponse.json(user, { status: 200 });
	} catch (error) {
		return toErrorResponse(error);
	}
});