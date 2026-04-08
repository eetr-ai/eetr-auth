const OAUTH_PENDING_COOKIE_NAME = "oauth_pending";
const OAUTH_PENDING_COOKIE_TTL_SECONDS = 300;

export const AUTHORIZE_PARAM_KEYS = [
	"response_type",
	"client_id",
	"redirect_uri",
	"scope",
	"state",
	"code_challenge",
	"code_challenge_method",
] as const;

type AuthorizeParamKey = (typeof AUTHORIZE_PARAM_KEYS)[number];

export type PendingAuthorizationParams = Partial<Record<AuthorizeParamKey, string>>;

interface PendingAuthorizationEnvelope {
	params: PendingAuthorizationParams;
	exp: number;
}

function getPendingSecret(env?: Record<string, unknown>): string {
	const hasEnvOauthSecret = typeof env?.OAUTH_PENDING_SECRET === "string" && (env.OAUTH_PENDING_SECRET as string).trim().length > 0;
	const hasEnvAuthSecret = typeof env?.AUTH_SECRET === "string" && (env.AUTH_SECRET as string).trim().length > 0;
	const hasProcessOauthSecret = typeof process.env.OAUTH_PENDING_SECRET === "string" && process.env.OAUTH_PENDING_SECRET.trim().length > 0;
	const hasProcessAuthSecret = typeof process.env.AUTH_SECRET === "string" && process.env.AUTH_SECRET.trim().length > 0;
	const hasProcessNextAuthSecret = typeof process.env.NEXTAUTH_SECRET === "string" && process.env.NEXTAUTH_SECRET.trim().length > 0;
const fromEnv = hasEnvOauthSecret
		? (env!.OAUTH_PENDING_SECRET as string).trim()
		: hasEnvAuthSecret
			? (env!.AUTH_SECRET as string).trim()
			: null;
	const secret =
		fromEnv ??
		(hasProcessOauthSecret ? process.env.OAUTH_PENDING_SECRET : null) ??
		(hasProcessAuthSecret ? process.env.AUTH_SECRET : null) ??
		(hasProcessNextAuthSecret ? process.env.NEXTAUTH_SECRET : null);
	if (!secret) {
		throw new Error("Missing OAUTH_PENDING_SECRET (or AUTH_SECRET) for oauth_pending cookie.");
	}
	return secret;
}

function base64UrlEncode(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array {
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
	const binary = atob(normalized + padding);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

async function sign(data: string, env?: Record<string, unknown>): Promise<string> {
	const secret = getPendingSecret(env);
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"]
	);
	const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
	return base64UrlEncode(new Uint8Array(signature));
}

async function verify(data: string, signature: string, env?: Record<string, unknown>): Promise<boolean> {
	const expected = await sign(data, env);
	if (expected.length !== signature.length) {
		return false;
	}
	let mismatch = 0;
	for (let i = 0; i < expected.length; i += 1) {
		mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
	}
	return mismatch === 0;
}

function sanitizeParams(params: PendingAuthorizationParams): PendingAuthorizationParams {
	const out: PendingAuthorizationParams = {};
	for (const key of AUTHORIZE_PARAM_KEYS) {
		const raw = params[key];
		if (typeof raw !== "string") continue;
		const value = raw.trim();
		if (value.length === 0) continue;
		out[key] = value;
	}
	return out;
}

export function getPendingCookieName(): string {
	return OAUTH_PENDING_COOKIE_NAME;
}

export function getPendingCookieTtlSeconds(): number {
	return OAUTH_PENDING_COOKIE_TTL_SECONDS;
}

export function collectPendingAuthorizationParams(
	source: URLSearchParams | FormData
): PendingAuthorizationParams {
	const out: PendingAuthorizationParams = {};
	for (const key of AUTHORIZE_PARAM_KEYS) {
		const raw = source.get(key);
		if (typeof raw !== "string") continue;
		const value = raw.trim();
		if (value.length === 0) continue;
		out[key] = value;
	}
	return out;
}

export async function encodePendingAuthorizationCookie(
	params: PendingAuthorizationParams,
	env?: Record<string, unknown>
): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	const envelope: PendingAuthorizationEnvelope = {
		params: sanitizeParams(params),
		exp: now + OAUTH_PENDING_COOKIE_TTL_SECONDS,
	};
	const payloadJson = JSON.stringify(envelope);
	const payloadPart = base64UrlEncode(new TextEncoder().encode(payloadJson));
	const signature = await sign(payloadPart, env);
	return `${payloadPart}.${signature}`;
}

export async function decodePendingAuthorizationCookie(
	cookieValue: string | undefined | null,
	env?: Record<string, unknown>
): Promise<PendingAuthorizationParams | null> {
	if (!cookieValue) return null;
	const [payloadPart, signature] = cookieValue.split(".");
	if (!payloadPart || !signature) return null;

	try {
		const valid = await verify(payloadPart, signature, env);
		if (!valid) return null;
		const payloadJson = new TextDecoder().decode(base64UrlDecode(payloadPart));
		const envelope = JSON.parse(payloadJson) as PendingAuthorizationEnvelope;
		const now = Math.floor(Date.now() / 1000);
		if (!envelope || typeof envelope !== "object") return null;
		if (typeof envelope.exp !== "number" || envelope.exp <= now) return null;
		return sanitizeParams(envelope.params ?? {});
	} catch {
		return null;
	}
}
