/** Augment generated Wrangler env with secrets and optional vars. */
declare namespace Cloudflare {
	interface Env {
		RESEND_API_KEY?: string;
		JWT_PRIVATE_KEY?: string;
		JWT_KID?: string;
		JWT_JWKS_JSON?: string;
		AUTH_SECRET?: string;
		/** HMAC key for at-rest secrets (OAuth client_secret `h1:` prefix, future uses). `wrangler secret put HMAC_KEY` or `.dev.vars`. */
		HMAC_KEY?: string;
	}
}

declare namespace NodeJS {
	interface ProcessEnv {
		HMAC_KEY?: string;
	}
}
