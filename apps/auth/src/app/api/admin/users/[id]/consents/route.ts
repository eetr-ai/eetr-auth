import { NextResponse } from "next/server";
import { withAdminApiClientContext } from "@/lib/context/with-admin-api-client-context";

/**
 * `/api/admin/users/{id}/consents` — parts are ["api","admin","users","{id}","consents"],
 * so the user segment is index 3, matching the sibling user routes.
 */
function getUserIdFromPath(pathname: string): string | null {
	const parts = pathname.split("/").filter(Boolean);
	if (parts.length < 5) {
		return null;
	}
	const userId = decodeURIComponent(parts[3] ?? "").trim();
	return userId.length > 0 ? userId : null;
}

function invalidRequest(description: string) {
	return NextResponse.json(
		{ error: "invalid_request", error_description: description },
		{ status: 400 }
	);
}

function notFound(description: string) {
	return NextResponse.json({ error: "not_found", error_description: description }, { status: 404 });
}

function toErrorResponse(error: unknown) {
	const message = error instanceof Error ? error.message : "Unexpected error.";
	return NextResponse.json({ error: "server_error", error_description: message }, { status: 500 });
}

export const GET = withAdminApiClientContext(async (req, _ctx, getServices) => {
	const userId = getUserIdFromPath(req.nextUrl.pathname);
	if (!userId) {
		return invalidRequest("User id path parameter is required.");
	}

	try {
		const { userService, consentService } = getServices();
		// Accepts an id or a username, like the sibling user routes.
		const user = await userService.getByIdOrUsername(userId);
		if (!user) {
			return notFound("User not found");
		}
		const consents = await consentService.listForUser(user.id);
		return NextResponse.json(
			{
				consents: consents.map((consent) => ({
					clientId: consent.clientIdentifier,
					clientName: consent.clientName,
					scopes: consent.scopeNames,
					createdAt: consent.createdAt,
					updatedAt: consent.updatedAt,
				})),
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error);
	}
});

export const DELETE = withAdminApiClientContext(async (req, _ctx, getServices, auth) => {
	const userId = getUserIdFromPath(req.nextUrl.pathname);
	if (!userId) {
		return invalidRequest("User id path parameter is required.");
	}

	// The client is addressed by its public client_id, which is what an API caller has --
	// the internal row id is never exposed by the GET above.
	const clientIdentifier = req.nextUrl.searchParams.get("client_id")?.trim();
	if (!clientIdentifier) {
		return invalidRequest("client_id query parameter is required.");
	}

	try {
		const { userService, clientService, consentService } = getServices();
		const user = await userService.getByIdOrUsername(userId);
		if (!user) {
			return notFound("User not found");
		}
		const client = await clientService.getByClientIdentifier(clientIdentifier);
		if (!client) {
			return notFound("Client not found");
		}

		const actorUserId = auth.subjectUserId ?? `client:${auth.adminClientRowId}`;
		const result = await consentService.revoke(user.id, client.id, actorUserId);
		return NextResponse.json(result, { status: 200 });
	} catch (error) {
		return toErrorResponse(error);
	}
});
