/**
 * Returns the D1 database from Cloudflare env.
 * Use this via RequestContext in services; do not call getCloudflareContext() in repositories.
 */
export function getDb(env: CloudflareEnv): CloudflareEnv["DB"] {
	return env.DB;
}
