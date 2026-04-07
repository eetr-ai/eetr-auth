import type { NextRequest } from "next/server";
import { buildRequestContext } from "./build-context";
import type { RequestContext } from "./types";
import type { Services } from "@/lib/services/registry";
import { getServices as getServicesFromRegistry } from "@/lib/services/registry";

export type ApiContextHandler = (
	req: NextRequest,
	ctx: RequestContext,
	getServices: () => Services
) => Promise<Response>;

/**
 * Wraps an API route handler with request context and service access.
 * Use for all API routes that need D1 or services; the handler must not contain business logic, only service calls.
 */
export function withApiContext(handler: ApiContextHandler) {
	return async (req: NextRequest, context?: { params?: Promise<Record<string, string>> }) => {
		const ctx = await buildRequestContext();
		const services = getServicesFromRegistry(ctx);
		return handler(req, ctx, () => services);
	};
}
