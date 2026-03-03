import { auth } from "@/auth";
import { buildRequestContext } from "./build-context";
import type { RequestContext } from "./types";
import type { Services } from "@/lib/services/registry";
import { getServices as getServicesFromRegistry } from "@/lib/services/registry";

/**
 * Wraps a server action body with request context and service access.
 * Fails with "Unauthorized" if the user is not signed in.
 * Use only in files with "use server"; the callback must contain no business logic, only service calls.
 */
export async function onServerAction<TReturn>(
	fn: (ctx: RequestContext, getServices: () => Services) => Promise<TReturn>
): Promise<TReturn> {
	const session = await auth();
	if (!session?.user) {
		throw new Error("Unauthorized");
	}
	const ctx = await buildRequestContext();
	const services = getServicesFromRegistry(ctx);
	return fn(ctx, () => services);
}
