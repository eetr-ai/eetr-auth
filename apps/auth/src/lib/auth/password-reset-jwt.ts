import { SignJWT, importPKCS8, jwtVerify, createLocalJWKSet } from "jose";
import { resolveIssuerBaseUrl } from "@/lib/config/issuer-base-url";

const JWKS_R2_KEY_DEFAULT = "jwks.json";
export const PASSWORD_RESET_JWT_PURPOSE = "password_reset";
export const PASSWORD_RESET_JWT_TTL_SECONDS = 3600;

function getPrivateKeyPem(env: Record<string, unknown>): string | null {
	return (
		(typeof env.JWT_PRIVATE_KEY === "string" ? env.JWT_PRIVATE_KEY : null) ??
		(typeof process.env.JWT_PRIVATE_KEY === "string" ? process.env.JWT_PRIVATE_KEY : null)
	);
}

async function resolveKid(
	env: Record<string, unknown>,
	blogImages: { get(key: string): Promise<{ body: ReadableStream } | null> } | undefined,
	jwksR2Key: string
): Promise<string> {
	const envKid =
		(typeof env.JWT_KID === "string" ? env.JWT_KID : null) ??
		(typeof process.env.JWT_KID === "string" ? process.env.JWT_KID : null);

	if (blogImages) {
		const r2Obj = await blogImages.get(jwksR2Key);
		if (r2Obj) {
			const jwks = (await new Response(r2Obj.body).json()) as { keys: Array<{ kid?: string }> };
			return jwks?.keys?.[0]?.kid ?? envKid ?? "default";
		}
	}
	if (envKid) return envKid;
	throw new Error("JWKS not available: set JWT_KID or publish JWKS to R2 for password reset signing.");
}

async function loadJwksForVerify(env: Record<string, unknown>): Promise<{ keys: unknown[] } | null> {
	const jwksJsonRaw =
		(typeof env.JWT_JWKS_JSON === "string" && env.JWT_JWKS_JSON.trim().length > 0
			? env.JWT_JWKS_JSON
			: typeof process.env.JWT_JWKS_JSON === "string" && process.env.JWT_JWKS_JSON.trim().length > 0
				? process.env.JWT_JWKS_JSON
				: null) as string | null;
	if (jwksJsonRaw) {
		try {
			const parsed = JSON.parse(jwksJsonRaw) as { keys: unknown[] };
			if (parsed?.keys?.length) return parsed;
		} catch {
			// fall through
		}
	}
	const blogImages = env.BLOG_IMAGES as { get(key: string): Promise<{ body: ReadableStream } | null> } | undefined;
	const jwksR2Key = (typeof env.JWKS_R2_KEY === "string" ? env.JWKS_R2_KEY : null) ?? JWKS_R2_KEY_DEFAULT;
	if (blogImages) {
		const r2Obj = await blogImages.get(jwksR2Key);
		if (r2Obj) {
			return (await new Response(r2Obj.body).json()) as { keys: unknown[] };
		}
	}
	return null;
}

export async function signPasswordResetJwt(
	env: Record<string, unknown>,
	params: { challengeId: string; userId: string; expiresAt: Date }
): Promise<string> {
	const privateKeyPem = getPrivateKeyPem(env);
	if (!privateKeyPem) {
		throw new Error("JWT_PRIVATE_KEY is not configured.");
	}
	const issuer = resolveIssuerBaseUrl(env);
	const blogImages = env.BLOG_IMAGES as { get(key: string): Promise<{ body: ReadableStream } | null> } | undefined;
	const jwksR2Key = (typeof env.JWKS_R2_KEY === "string" ? env.JWKS_R2_KEY : null) ?? JWKS_R2_KEY_DEFAULT;
	const kid = await resolveKid(env, blogImages, jwksR2Key);
	const privateKey = await importPKCS8(privateKeyPem, "RS256");
	const now = Math.floor(Date.now() / 1000);
	const exp = Math.floor(params.expiresAt.getTime() / 1000);

	return new SignJWT({ purpose: PASSWORD_RESET_JWT_PURPOSE })
		.setProtectedHeader({ alg: "RS256", kid })
		.setIssuer(issuer)
		.setSubject(params.userId)
		.setJti(params.challengeId)
		.setIssuedAt(now)
		.setExpirationTime(exp)
		.sign(privateKey);
}

export async function verifyPasswordResetJwt(
	env: Record<string, unknown>,
	token: string
): Promise<{ challengeId: string; userId: string }> {
	const jwks = await loadJwksForVerify(env);
	if (!jwks?.keys?.length) {
		throw new Error("JWKS not available for password reset verification.");
	}
	const issuer = resolveIssuerBaseUrl(env);
	const JWKS = createLocalJWKSet(jwks as Parameters<typeof createLocalJWKSet>[0]);
	const { payload } = await jwtVerify(token, JWKS, { issuer });
	if (payload.purpose !== PASSWORD_RESET_JWT_PURPOSE) {
		throw new Error("Invalid token purpose.");
	}
	const challengeId = typeof payload.jti === "string" ? payload.jti : "";
	const userId = typeof payload.sub === "string" ? payload.sub : "";
	if (!challengeId || !userId) {
		throw new Error("Invalid token claims.");
	}
	return { challengeId, userId };
}
