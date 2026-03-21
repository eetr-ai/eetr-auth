/** Augment generated Wrangler env with secrets and optional vars. */
declare namespace Cloudflare {
	interface Env {
		RESEND_API_KEY?: string;
		JWT_PRIVATE_KEY?: string;
		JWT_KID?: string;
		JWT_JWKS_JSON?: string;
		AUTH_SECRET?: string;
	}
}
