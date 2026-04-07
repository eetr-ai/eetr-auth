/**
 * Returns the D1 database from Cloudflare env.
 * Use this via RequestContext in services; do not call getCloudflareContext() in repositories.
 */
export function getDb(env: CloudflareEnv): CloudflareEnv["DB"] {
	if (!env?.DB) {
		throw new Error(
			"Cloudflare D1 binding 'DB' is unavailable in the current request context. Ensure the Cloudflare context is initialized with the auth worker bindings before resolving services."
		);
	}

	return env.DB;
}
