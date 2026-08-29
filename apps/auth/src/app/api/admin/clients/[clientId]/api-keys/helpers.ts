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
