/**
 * Auth.js / NextAuth secret; used for MFA HMAC and other server-only secrets.
 */
export function getAuthSecret(): string {
	const s =
		(typeof process.env.AUTH_SECRET === "string" && process.env.AUTH_SECRET.length > 0
			? process.env.AUTH_SECRET
			: null) ??
		(typeof process.env.NEXTAUTH_SECRET === "string" && process.env.NEXTAUTH_SECRET.length > 0
			? process.env.NEXTAUTH_SECRET
			: null);
	if (!s) {
		throw new Error("AUTH_SECRET (or NEXTAUTH_SECRET) is not configured.");
	}
	return s;
}
