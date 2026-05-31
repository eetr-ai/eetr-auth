import { auth } from "@/auth";
import { buildRequestContext } from "./build-context";
import type { RequestContext } from "./types";
import type { Services } from "@/lib/services/registry";
import { getServices as getServicesFromRegistry } from "@/lib/services/registry";

async function runWithContext<TReturn>(
	fn: (ctx: RequestContext, getServices: () => Services) => Promise<TReturn>
): Promise<TReturn> {
	const ctx = await buildRequestContext();
	const services = getServicesFromRegistry(ctx);
	return fn(ctx, () => services);
}

/**
 * Wraps a server action body with request context and service access.
 * Fails with "Unauthorized" if the user is not signed in.
 * Use only in files with "use server"; the callback must contain no business logic, only service calls.
 *
 * NOTE: this only proves a session exists — it does NOT check for admin rights.
 * Privileged admin operations (clients, users, scopes, environments, tokens,
 * site settings, audit logs) must use {@link onAdminServerAction} instead, since
 * server actions are reachable via direct RPC POSTs regardless of which page rendered them.
 */
export async function onServerAction<TReturn>(
	fn: (ctx: RequestContext, getServices: () => Services) => Promise<TReturn>
): Promise<TReturn> {
	const session = await auth();
	if (!session?.user) {
		throw new Error("Unauthorized");
	}
	return runWithContext(fn);
}

/**
 * Like {@link onServerAction}, but additionally requires the signed-in user to be an admin.
 * Use for every privileged admin-surface action; a non-admin session throws "Forbidden".
 */
export async function onAdminServerAction<TReturn>(
	fn: (ctx: RequestContext, getServices: () => Services) => Promise<TReturn>
): Promise<TReturn> {
	const session = await auth();
	if (!session?.user) {
		throw new Error("Unauthorized");
	}
	if (!session.user.isAdmin) {
		throw new Error("Forbidden");
	}
	return runWithContext(fn);
}
