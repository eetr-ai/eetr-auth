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

function getPendingSecret(): string {
	const secret = process.env.OAUTH_PENDING_SECRET ?? process.env.NEXTAUTH_SECRET;
	if (!secret || secret.trim().length === 0) {
		throw new Error("Missing OAUTH_PENDING_SECRET (or NEXTAUTH_SECRET) for oauth_pending cookie.");
	}
	return secret.trim();
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

async function sign(data: string, secret: string): Promise<string> {
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

async function verify(data: string, signature: string, secret: string): Promise<boolean> {
	const expected = await sign(data, secret);
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
	params: PendingAuthorizationParams
): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	const envelope: PendingAuthorizationEnvelope = {
		params: sanitizeParams(params),
		exp: now + OAUTH_PENDING_COOKIE_TTL_SECONDS,
	};
	const payloadJson = JSON.stringify(envelope);
	const payloadPart = base64UrlEncode(new TextEncoder().encode(payloadJson));
	const signature = await sign(payloadPart, getPendingSecret());
	return `${payloadPart}.${signature}`;
}

export async function decodePendingAuthorizationCookie(
	cookieValue: string | undefined | null
): Promise<PendingAuthorizationParams | null> {
	if (!cookieValue) return null;
	const [payloadPart, signature] = cookieValue.split(".");
	if (!payloadPart || !signature) return null;

	try {
		const valid = await verify(payloadPart, signature, getPendingSecret());
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
