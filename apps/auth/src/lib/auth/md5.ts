// Pure-JS MD5 for Edge runtime compatibility (middleware, auth route)
import md5Lib from "md5";

/**
 * MD5 hash for password comparison (legacy).
 * Consider upgrading to a stronger hash (e.g. bcrypt/argon2) for production.
 */
export function md5(value: string): string {
	return md5Lib(value);
}
