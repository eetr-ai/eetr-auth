import { NextResponse } from "next/server";
import { withAdminApiClientContext } from "@/lib/context/with-admin-api-client-context";
import { selfServiceOptions } from "../helpers";

/**
 * `/api/admin/clients/{clientId}/api-keys/{keyId}` — parts are
 * ["api","admin","clients","{clientId}","api-keys","{keyId}"], so the client segment is
 * index 3 and the key handle is index 5.
 */
function getPathParams(pathname: string): { clientId: string; keyId: string } | null {
	const parts = pathname.split("/").filter(Boolean);
	if (parts.length < 6) {
		return null;
	}
	const clientId = decodeURIComponent(parts[3] ?? "").trim();
	const keyId = decodeURIComponent(parts[5] ?? "").trim();
	if (!clientId || !keyId) {
		return null;
	}
	return { clientId, keyId };
}

function notFound(description: string) {
	return NextResponse.json({ error: "not_found", error_description: description }, { status: 404 });
}

/**
 * Revoke is a soft delete: the row survives so the audit trail and the activity-log entries
 * that reference this key still resolve. Revoking twice is a no-op that keeps the original
 * timestamp, so this is safe to retry.
 */
export const DELETE = withAdminApiClientContext(async (req, _ctx, getServices, auth) => {
	const params = getPathParams(req.nextUrl.pathname);
	if (!params) {
		return NextResponse.json(
			{
				error: "invalid_request",
				error_description: "Client id and key id path parameters are required.",
			},
			{ status: 400 }
		);
	}

	try {
		const { clientService, apiKeyService } = getServices();
		const client = await clientService.getByClientIdentifier(params.clientId);
		if (!client) {
			return notFound("Client not found");
		}
		// Scoped to the client, so this route cannot revoke another client's key -- and, for
		// a self-service caller, additionally to that caller's own user. A key belonging to
		// someone else reads as 404 rather than 403, so the handle's existence stays hidden.
		const apiKey = auth.selfServiceUserId
			? await apiKeyService.getByKeyIdForClientAndUser(
					client.id,
					params.keyId,
					auth.selfServiceUserId
				)
			: await apiKeyService.getByKeyIdForClient(client.id, params.keyId);
		if (!apiKey) {
			return notFound("API key not found");
		}

		// A client-credentials token has no subject; pass null rather than a synthetic user
		// id, and name the calling client in the audit details instead.
		await apiKeyService.revoke(apiKey.id, auth.subjectUserId, {
			viaAdminClientRowId: auth.adminClientRowId,
		});
		return NextResponse.json({ ok: true }, { status: 200 });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unexpected error.";
		return NextResponse.json({ error: "server_error", error_description: message }, { status: 500 });
	}
}, selfServiceOptions);
