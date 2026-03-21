import { buildRequestContext } from "./build-context";
import type { RequestContext } from "./types";
import type { Services } from "@/lib/services/registry";
import { getServices as getServicesFromRegistry } from "@/lib/services/registry";

/**
 * Server actions that must run without a signed-in session (e.g. sign-in MFA, password reset).
 */
export async function onPublicServerAction<TReturn>(
	fn: (ctx: RequestContext, getServices: () => Services) => Promise<TReturn>
): Promise<TReturn> {
	const ctx = await buildRequestContext();
	const services = getServicesFromRegistry(ctx);
	return fn(ctx, () => services);
}
