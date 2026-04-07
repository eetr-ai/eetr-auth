import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { RequestContext } from "./types";

/**
 * Builds the app request context from the current Cloudflare context.
 * Use this inside onServerAction and withApiContext only; do not call in services or repositories.
 */
export async function buildRequestContext(): Promise<RequestContext> {
	const { env, cf, ctx } = await getCloudflareContext({ async: true });
	return {
		env,
		cf,
		ctx,
		requestId: crypto.randomUUID?.(),
	};
}
