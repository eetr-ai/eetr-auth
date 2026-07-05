import { NextResponse } from "next/server";

/**
 * Shared CORS + cache helpers for public OAuth/OIDC endpoints.
 *
 * These endpoints are called from browser-based clients (SPA/PKCE flows, MCP
 * clients) and authenticate via bearer tokens or client credentials — never
 * cookies — so a wildcard origin is safe.
 */

/** No-store cache headers required for token/userinfo responses (RFC 6749 §5.1). */
export const NO_STORE_HEADERS = {
	"Cache-Control": "no-store",
	Pragma: "no-cache",
} as const;

/** Build CORS headers allowing the given methods from any origin. */
export function corsHeaders(methods: string): Record<string, string> {
	return {
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Methods": methods,
		"Access-Control-Allow-Headers": "Content-Type, Authorization",
	};
}

/** No-store cache headers merged with CORS — the common shape for OAuth JSON responses. */
export function noStoreCorsHeaders(methods: string): Record<string, string> {
	return { ...NO_STORE_HEADERS, ...corsHeaders(methods) };
}

/** A CORS preflight (OPTIONS) route handler for the given allowed methods. */
export function corsPreflight(methods: string) {
	const headers = corsHeaders(methods);
	return () => new NextResponse(null, { status: 204, headers });
}
