import { NextResponse } from "next/server";
import { withApiContext } from "@/lib/context/with-api-context";
import { authenticateSessionOrBearerUser } from "@/lib/auth/authenticate-session-or-bearer-user";

/** Extracts the passkey row id from `/api/users/passkey/<id>`. */
function getPasskeyIdFromPath(pathname: string): string | null {
	const parts = pathname.split("/").filter(Boolean);
	// ["api", "users", "passkey", "<id>"]
	const id = decodeURIComponent(parts[3] ?? "").trim();
	return id.length > 0 ? id : null;
}

const notFound = () =>
	NextResponse.json(
		{ error: "not_found", error_description: "Passkey not found." },
		{ status: 404 }
	);

export const PATCH = withApiContext(async (req, _ctx, getServices) => {
	const authResult = await authenticateSessionOrBearerUser(req, getServices);
	if ("response" in authResult) {
		return authResult.response;
	}

	const rowId = getPasskeyIdFromPath(req.nextUrl.pathname);
	if (!rowId) {
		return NextResponse.json(
			{ error: "invalid_request", error_description: "Passkey id path parameter is required." },
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

	const body = payload as { name?: unknown };
	if (typeof body.name !== "string" || body.name.trim().length === 0) {
		return NextResponse.json(
			{ error: "invalid_request", error_description: "name is required." },
			{ status: 400 }
		);
	}

	try {
		const { passkeyService } = getServices();
		const updated = await passkeyService.renamePasskey(
			authResult.user.userId,
			rowId,
			body.name
		);
		if (!updated) return notFound();
		return NextResponse.json({ ok: true }, { status: 200 });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unexpected error.";
		if (message === "Passkey name cannot be empty.") {
			return NextResponse.json({ error: "invalid_request", error_description: message }, { status: 400 });
		}
		return NextResponse.json({ error: "server_error", error_description: message }, { status: 500 });
	}
});

export const DELETE = withApiContext(async (req, _ctx, getServices) => {
	const authResult = await authenticateSessionOrBearerUser(req, getServices);
	if ("response" in authResult) {
		return authResult.response;
	}

	const rowId = getPasskeyIdFromPath(req.nextUrl.pathname);
	if (!rowId) {
		return NextResponse.json(
			{ error: "invalid_request", error_description: "Passkey id path parameter is required." },
			{ status: 400 }
		);
	}

	try {
		const { passkeyService } = getServices();
		const removed = await passkeyService.removePasskey(authResult.user.userId, rowId);
		if (!removed) return notFound();
		return NextResponse.json({ ok: true }, { status: 200 });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unexpected error.";
		return NextResponse.json({ error: "server_error", error_description: message }, { status: 500 });
	}
});
