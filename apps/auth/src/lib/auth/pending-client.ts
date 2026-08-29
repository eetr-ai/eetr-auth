import { cookies } from "next/headers";
import {
	decodePendingAuthorizationCookie,
	getPendingCookieName,
} from "@/lib/auth/oauth-pending-cookie";
import type { Client } from "@/lib/repositories/client.repository";
import type { ClientService } from "@/lib/services/client.service";

/**
 * The OAuth client the user is currently signing in to, read from the pending
 * authorization cookie set by GET /api/authorize.
 *
 * Returns null for a non-OAuth sign-in (e.g. straight to the dashboard), an expired or
 * tampered cookie, or a client_id that no longer resolves. Callers must treat null as
 * "no client context", never as "any client".
 *
 * This is the single source of truth for that lookup: the sign-in page, the MFA
 * pre-flight action and the NextAuth providers all need it, and a drifting second copy
 * would mean a gate applied on one path and not another.
 */
export async function resolvePendingClient(
	clientService: ClientService,
	env: Record<string, unknown>
): Promise<Client | null> {
	const jar = await cookies();
	const params = await decodePendingAuthorizationCookie(jar.get(getPendingCookieName())?.value, env);
	const clientId = params?.client_id?.trim();
	if (!clientId) return null;
	return (await clientService.getByClientIdentifier(clientId)) ?? null;
}

/**
 * Environment of the pending OAuth client, or null when there is no client context.
 * Used to scope the password policy to the environment being signed in to.
 */
export async function resolvePendingEnvironmentId(
	clientService: ClientService,
	env: Record<string, unknown>
): Promise<string | null> {
	return (await resolvePendingClient(clientService, env))?.environmentId ?? null;
}
