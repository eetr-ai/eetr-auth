import { NextResponse } from "next/server";
import { withAdminApiClientContext } from "@/lib/context/with-admin-api-client-context";
import type { ApiKey } from "@/lib/repositories/api-key.repository";

/**
 * `/api/admin/clients/{clientId}/api-keys` — parts are
 * ["api","admin","clients","{clientId}","api-keys"], so the client segment is index 3.
 *
 * The client is addressed by its public `client_id`, not the internal row id, matching the
 * consents route: the row id is never exposed by any admin response.
 */
export function getClientIdFromPath(pathname: string): string | null {
	const parts = pathname.split("/").filter(Boolean);
	if (parts.length < 5) {
		return null;
	}
	const clientId = decodeURIComponent(parts[3] ?? "").trim();
	return clientId.length > 0 ? clientId : null;
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
	// Caller-fixable problems raised by ApiKeyService.create.
	if (
		/^Scope not granted/u.test(message) ||
		message === "User not found" ||
		message === "Client not found" ||
		/valid ISO timestamp/u.test(message) ||
		/test user can only be bound/u.test(message)
	) {
		return NextResponse.json({ error: "invalid_request", error_description: message }, { status: 400 });
	}
	return NextResponse.json({ error: "server_error", error_description: message }, { status: 500 });
}

/** The wire shape. `keyId` is the public handle; the secret is never in a list response. */
export function toApiKeyPayload(apiKey: ApiKey) {
	return {
		keyId: apiKey.keyId,
		name: apiKey.name,
		userId: apiKey.userId,
		username: apiKey.userDisplay,
		createdBy: apiKey.createdBy,
		createdAt: apiKey.createdAt,
		expiresAt: apiKey.expiresAt,
		revokedAt: apiKey.revokedAt,
		lastUsedAt: apiKey.lastUsedAt,
	};
}

export const GET = withAdminApiClientContext(async (req, _ctx, getServices) => {
	const clientIdentifier = getClientIdFromPath(req.nextUrl.pathname);
	if (!clientIdentifier) {
		return invalidRequest("Client id path parameter is required.");
	}

	try {
		const { clientService, apiKeyService } = getServices();
		const client = await clientService.getByClientIdentifier(clientIdentifier);
		if (!client) {
			return notFound("Client not found");
		}
		const apiKeys = await apiKeyService.list(client.id);
		return NextResponse.json({ apiKeys: apiKeys.map(toApiKeyPayload) }, { status: 200 });
	} catch (error) {
		return toErrorResponse(error);
	}
});

export const POST = withAdminApiClientContext(async (req, _ctx, getServices, auth) => {
	const clientIdentifier = getClientIdFromPath(req.nextUrl.pathname);
	if (!clientIdentifier) {
		return invalidRequest("Client id path parameter is required.");
	}

	let payload: unknown;
	try {
		payload = await req.json();
	} catch {
		return invalidRequest("Request body must be valid JSON.");
	}

	// req.json() resolves to null for the body `null`, and to a primitive for `5` or `"x"`.
	// Reading properties off those throws a TypeError that escapes the try block below,
	// turning an intended 400 into a 500.
	if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
		return invalidRequest("Request body must be a JSON object.");
	}

	const body = payload as {
		userId?: unknown;
		user_id?: unknown;
		username?: unknown;
		name?: unknown;
		expiresAt?: unknown;
		expires_at?: unknown;
		scopes?: unknown;
	};

	// A key must name its user: the minted token's `sub` is that user, so an unbound key
	// would produce machine tokens nobody is accountable for.
	const userRef =
		[body.userId, body.user_id, body.username].find((v) => typeof v === "string" && v.trim()) ??
		null;
	if (typeof userRef !== "string") {
		return invalidRequest("userId (or username) is required.");
	}

	if (body.name !== undefined && typeof body.name !== "string") {
		return invalidRequest("name must be a string.");
	}
	const expiresAtRaw = body.expiresAt ?? body.expires_at;
	if (expiresAtRaw !== undefined && expiresAtRaw !== null && typeof expiresAtRaw !== "string") {
		return invalidRequest("expiresAt must be an ISO timestamp string or null.");
	}
	if (
		body.scopes !== undefined &&
		(!Array.isArray(body.scopes) || body.scopes.some((s) => typeof s !== "string"))
	) {
		return invalidRequest("scopes must be an array of scope names.");
	}

	try {
		const { clientService, userService, apiKeyService } = getServices();
		const client = await clientService.getByClientIdentifier(clientIdentifier);
		if (!client) {
			return notFound("Client not found");
		}
		// Accepts an id or a username, like the sibling user routes.
		const user = await userService.getByIdOrUsername(userRef.trim());
		if (!user) {
			return notFound("User not found");
		}

		// api_keys.created_by is a FK to users(id), so the `client:<id>` label the sibling
		// admin routes use for audit rows would fail the constraint outright. A
		// client-credentials token has no subject; the calling client is recorded on the
		// audit entry instead, where the column is free-form.
		const result = await apiKeyService.create(
			{
				clientRowId: client.id,
				userId: user.id,
				name: typeof body.name === "string" ? body.name : null,
				expiresAt: typeof expiresAtRaw === "string" ? expiresAtRaw : null,
				scopeNames: Array.isArray(body.scopes) ? (body.scopes as string[]) : undefined,
			},
			auth.subjectUserId,
			{ viaAdminClientRowId: auth.adminClientRowId }
		);

		// The only time the full credential is ever returned. It is not recoverable later.
		return NextResponse.json(
			{ ...toApiKeyPayload(result.apiKey), apiKey: result.presentedKey },
			{ status: 201 }
		);
	} catch (error) {
		return toErrorResponse(error);
	}
});
