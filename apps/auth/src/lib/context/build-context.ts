import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { RequestContext } from "./types";

const CLOUDFLARE_CONTEXT_SYMBOL = Symbol.for("__cloudflare-context__");

type CloudflareContextResult = {
	env: CloudflareEnv;
	cf: Record<string, unknown> | undefined;
	ctx: ExecutionContext;
};

function hasD1Binding(env: unknown): env is CloudflareEnv {
	return !!env && typeof env === "object" && "DB" in env && !!(env as { DB?: unknown }).DB;
}

async function getFreshCloudflareContext(): Promise<CloudflareContextResult> {
	const globalScope = globalThis as Record<PropertyKey, unknown>;
	delete globalScope[CLOUDFLARE_CONTEXT_SYMBOL];
	return (await getCloudflareContext({ async: true })) as CloudflareContextResult;
}

async function resolveCloudflareContext(): Promise<CloudflareContextResult> {
	const context = (await getCloudflareContext({ async: true })) as CloudflareContextResult;
	if (hasD1Binding(context.env)) {
		return context;
	}

	if (process.env.NODE_ENV !== "production") {
		const refreshedContext = await getFreshCloudflareContext();
		if (hasD1Binding(refreshedContext.env)) {
			return refreshedContext;
		}
	}

	return context;
}

/**
 * Builds the app request context from the current Cloudflare context.
 * Use this inside onServerAction and withApiContext only; do not call in services or repositories.
 */
export async function buildRequestContext(): Promise<RequestContext> {
	const { env, cf, ctx } = await resolveCloudflareContext();
	return {
		env,
		cf,
		ctx,
		requestId: crypto.randomUUID?.(),
	};
}
