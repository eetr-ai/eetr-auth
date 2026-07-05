import { SignJWT, importPKCS8, jwtVerify, createLocalJWKSet, decodeJwt } from "jose";
import { resolveIssuerBaseUrl } from "@/lib/config/issuer-base-url";
import type { ClientRepository } from "@/lib/repositories/client.repository";
import type { AuthorizationCodeRepository } from "@/lib/repositories/authorization-code.repository";
import type { TokenRepository } from "@/lib/repositories/token.repository";
import type { RefreshTokenRepository } from "@/lib/repositories/refresh-token.repository";
import type { EnvironmentRepository } from "@/lib/repositories/environment.repository";
import type { ClientScopeGrant } from "@/lib/repositories/token.repository";
import type {
	RefreshTokenActivity,
} from "@/lib/repositories/refresh-token.repository";
import type { AccessTokenActivity } from "@/lib/repositories/token.repository";
import { OAuthServiceError } from "./oauth.types";
import { normalizeResourceParam } from "./resource-indicator";
import { resolveHmacKey, verifyClientSecretAgainstStored } from "@/lib/auth/secret-at-rest";
import type { UserRepository } from "@/lib/repositories/admin.repository";
import { getAvatarUrl } from "@/lib/users/profile";

const JWKS_R2_KEY_DEFAULT = "jwks.json";

function isJwtFormat(token: string): boolean {
	const parts = token.trim().split(".");
	return parts.length === 3 && parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p));
}

const ACCESS_TOKEN_TTL_SECONDS = 3600;
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

function logTokenStep(step: string, startMs: number, extra?: Record<string, string | number | null>) {
	const durationMs = Date.now() - startMs;
	const extraStr = extra ? ` ${Object.entries(extra).map(([k, v]) => `${k}=${v}`).join(" ")}` : "";
	console.log(`[oauth_token] step=${step} duration_ms=${durationMs}${extraStr}`);
}

function generateOpaqueSecret(prefix: string, byteLength = 32): string {
	const bytes = new Uint8Array(byteLength);
	crypto.getRandomValues(bytes);
	const value = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
	return `${prefix}_${value}`;
}

function parseScopeParam(scope?: string | null): string[] {
	if (!scope?.trim()) return [];
	return Array.from(new Set(scope.split(/\s+/).map((s) => s.trim()).filter(Boolean)));
}

function scopesToString(scopes: string[]): string | undefined {
	return scopes.length > 0 ? scopes.join(" ") : undefined;
}

function toBase64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function toS256Challenge(value: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(value);
	const digest = await crypto.subtle.digest("SHA-256", data);
	return toBase64Url(new Uint8Array(digest));
}

/**
 * OIDC `at_hash` (Core 1.0 §3.1.3.6): base64url of the left-most half of the
 * hash of the access token's ASCII octets, using the hash paired with the
 * id_token's signing alg (RS256 → SHA-256 → left 128 bits / 16 bytes).
 */
async function computeAtHash(accessToken: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(accessToken));
	return toBase64Url(new Uint8Array(digest).slice(0, 16));
}

export interface OAuthTokenResponse {
	token_type: "Bearer";
	access_token: string;
	expires_in: number;
	refresh_token: string;
	scope?: string;
	id_token?: string;
}

export interface TokenActivityItem {
	tokenType: "access" | "refresh";
	tokenId: string;
	clientId: string;
	clientName: string | null;
	environmentId: string;
	expiresAt: string;
	status: "active" | "expired" | "revoked";
	scopeNames: string[];
	createdAt: string | null;
	rotatedFromTokenId: string | null;
}

export interface TokenRequestParams {
	grantType: string | null;
	clientId: string | null;
	clientSecret: string | null;
	scope?: string | null;
	code?: string | null;
	redirectUri?: string | null;
	codeVerifier?: string | null;
	refreshToken?: string | null;
	// RFC 8707 resource indicator sent to the token endpoint.
	resource?: string | null;
}

export interface ValidateTokenResult {
	valid: boolean;
	active: boolean;
	clientId: string | null;
	subject: string | null;
	environmentId: string | null;
	environmentMatch: boolean;
	expectedEnvironmentName: string | null;
	tokenEnvironmentName: string | null;
	expiresAt: string | null;
	tokenScopes: string[];
	requiredScopes: string[];
	missingScopes: string[];
}

export interface TokenMutationResult {
	tokenType: "access" | "refresh" | null;
}

export interface RevokeTokenResult extends TokenMutationResult {
	revoked: boolean;
}

export interface DeleteTokenResult extends TokenMutationResult {
	deleted: boolean;
}

export interface CleanupTokenArtifactsResult {
	accessTokensDeleted: number;
	refreshTokensExpiredDeleted: number;
	refreshTokensRevokedDeleted: number;
	authorizationCodesDeleted: number;
	totalDeleted: number;
}

export interface OauthTokenServiceDeps {
	clientRepo: ClientRepository;
	authorizationCodeRepo: AuthorizationCodeRepository;
	tokenRepo: TokenRepository;
	refreshTokenRepo: RefreshTokenRepository;
	envRepo: EnvironmentRepository;
	userRepo: UserRepository;
	env: CloudflareEnv;
}

export class OauthTokenService {
	private readonly env: CloudflareEnv;
	private readonly clientRepo: ClientRepository;
	private readonly authorizationCodeRepo: AuthorizationCodeRepository;
	private readonly tokenRepo: TokenRepository;
	private readonly refreshTokenRepo: RefreshTokenRepository;
	private readonly envRepo: EnvironmentRepository;
	private readonly userRepo: UserRepository;

	constructor({ clientRepo, authorizationCodeRepo, tokenRepo, refreshTokenRepo, envRepo, userRepo, env }: OauthTokenServiceDeps) {
		this.clientRepo = clientRepo;
		this.authorizationCodeRepo = authorizationCodeRepo;
		this.tokenRepo = tokenRepo;
		this.refreshTokenRepo = refreshTokenRepo;
		this.envRepo = envRepo;
		this.userRepo = userRepo;
		this.env = env;
	}

	private async authenticateClient(clientId: string | null, clientSecret: string | null) {
		const t0 = Date.now();
		if (!clientId) {
			throw new OAuthServiceError("invalid_client", "Missing client credentials.", 401);
		}
		const client = await this.clientRepo.getByClientIdentifier(clientId);
		logTokenStep("authenticate_client_lookup", t0);
		if (!client) {
			throw new OAuthServiceError("invalid_client", "Invalid client credentials.", 401);
		}
		// Public (PKCE-only) clients (RFC 7591 token_endpoint_auth_method="none") do not
		// authenticate with a secret; the authorization_code grant's PKCE code_verifier is
		// the proof of possession. Any secret presented is ignored. Confidential clients
		// keep the mandatory secret check unchanged.
		if (client.tokenEndpointAuthMethod !== "none") {
			if (!clientSecret) {
				throw new OAuthServiceError("invalid_client", "Missing client credentials.", 401);
			}
			const env = this.env as unknown as Record<string, unknown>;
			const hmacKey = resolveHmacKey(env);
			const v = await verifyClientSecretAgainstStored(clientSecret, client.clientSecret, hmacKey);
			if (!v.ok) {
				throw new OAuthServiceError("invalid_client", "Invalid client credentials.", 401);
			}
			if (v.upgradeToStored) {
				await this.clientRepo.updateSecret(client.id, v.upgradeToStored);
			}
		}
		const nowIso = new Date().toISOString();
		if (client.expiresAt && client.expiresAt <= nowIso) {
			throw new OAuthServiceError("invalid_client", "Client credentials have expired.", 401);
		}
		logTokenStep("authenticate_client_total", t0);
		return client;
	}

	private selectScopeGrants(
		allGrants: ClientScopeGrant[],
		requestedScopes: string[],
		errorDescription: string
	) {
		if (requestedScopes.length === 0) {
			return allGrants;
		}
		const byName = new Map(allGrants.map((grant) => [grant.scopeName, grant]));
		const selected: ClientScopeGrant[] = [];
		for (const scopeName of requestedScopes) {
			const grant = byName.get(scopeName);
			if (!grant) {
				throw new OAuthServiceError("invalid_scope", errorDescription, 400);
			}
			selected.push(grant);
		}
		return selected;
	}

	private async issueTokenPair(params: {
		clientId: string;
		clientScopeIds: string[];
		scopeNames: string[];
		subject: string | null;
		rotatedFromRefreshTokenId?: string | null;
		clientIdentifier?: string;
		/** OIDC: when true and the `openid` scope was granted, also issue an id_token. */
		issueIdToken?: boolean;
		nonce?: string | null;
		authTime?: string | null;
		/** RFC 8707: audience to bind the access token to (falls back to the client_id). */
		resource?: string | null;
	}): Promise<OAuthTokenResponse> {
		const env = this.env as unknown as Record<string, unknown>;
		// Prefer ctx.env; in next dev, .env.local is in process.env but may not be merged into ctx.env
		const privateKeyPem =
			(typeof env.JWT_PRIVATE_KEY === "string" ? env.JWT_PRIVATE_KEY : null) ??
			(typeof process.env.JWT_PRIVATE_KEY === "string" ? process.env.JWT_PRIVATE_KEY : null);
		const authAssets = env.AUTH_ASSETS as { get(key: string): Promise<{ body: ReadableStream } | null> } | undefined;
		const issuer = resolveIssuerBaseUrl(env);
		const jwksR2Key = (typeof env.JWKS_R2_KEY === "string" ? env.JWKS_R2_KEY : null) ?? JWKS_R2_KEY_DEFAULT;

		const clientIdentifier = params.clientIdentifier;
		// Need kid from env (JWT_KID) or R2 when using .env.local only
		const hasKidSource =
			authAssets ||
			(typeof env.JWT_KID === "string" && env.JWT_KID.length > 0) ||
			(typeof process.env.JWT_KID === "string" && process.env.JWT_KID.length > 0);
		if (privateKeyPem && clientIdentifier && hasKidSource) {
			const client = await this.clientRepo.getById(params.clientId);
			const env = client ? await this.envRepo.getById(client.environmentId) : null;
			const environmentName = env?.name ?? null;
			return this.issueTokenPairJwt({
				...params,
				clientIdentifier,
				environmentName,
				issuer,
				privateKeyPem,
				authAssets: authAssets ?? { get: async () => null },
				jwksR2Key,
			});
		}

		// Opaque-token mode cannot mint a signed id_token. In production JWT signing is
		// configured, so this only happens in misconfigured/dev setups — warn and degrade
		// gracefully (omit id_token) rather than break the token exchange.
		if (params.issueIdToken && params.scopeNames.includes("openid")) {
			console.warn(
				"[oauth_token] openid scope requested but JWT signing is not configured; id_token omitted (opaque-token mode)."
			);
		}

		const t0 = Date.now();
		const now = new Date();
		const accessToken = generateOpaqueSecret("at");
		const refreshToken = generateOpaqueSecret("rt");
		const accessTokenId = crypto.randomUUID();
		const refreshTokenId = crypto.randomUUID();
		const accessExpiresAt = new Date(now.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000);
		const refreshExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000);

		await this.tokenRepo.createAccessToken(
			{
				id: accessTokenId,
				token_id: accessToken,
				client_id: params.clientId,
				expires_at: accessExpiresAt.toISOString(),
				resource: params.resource ?? null,
			},
			params.clientScopeIds
		);
		logTokenStep("issue_create_access_token", t0);

		await this.refreshTokenRepo.createRefreshToken(
			{
				id: refreshTokenId,
				refresh_token_id: refreshToken,
				client_id: params.clientId,
				subject: params.subject,
				access_token_id: accessTokenId,
				expires_at: refreshExpiresAt.toISOString(),
				revoked_at: null,
				rotated_from_id: params.rotatedFromRefreshTokenId ?? null,
				created_at: now.toISOString(),
				resource: params.resource ?? null,
			},
			params.clientScopeIds
		);
		logTokenStep("issue_create_refresh_token", t0);
		logTokenStep("issue_token_pair_total", t0);

		return {
			token_type: "Bearer",
			access_token: accessToken,
			expires_in: ACCESS_TOKEN_TTL_SECONDS,
			refresh_token: refreshToken,
			scope: scopesToString(params.scopeNames),
		};
	}

	private async issueTokenPairJwt(params: {
		clientId: string;
		clientScopeIds: string[];
		scopeNames: string[];
		subject: string | null;
		rotatedFromRefreshTokenId?: string | null;
		clientIdentifier: string;
		environmentName: string | null;
		issuer: string;
		privateKeyPem: string;
		authAssets: { get(key: string): Promise<{ body: ReadableStream } | null> };
		jwksR2Key: string;
		issueIdToken?: boolean;
		nonce?: string | null;
		authTime?: string | null;
		resource?: string | null;
	}): Promise<OAuthTokenResponse> {
		const t0 = Date.now();
		const now = new Date();
		const jti = crypto.randomUUID();
		const accessTokenRowId = crypto.randomUUID();
		const refreshToken = generateOpaqueSecret("rt");
		const refreshTokenId = crypto.randomUUID();
		const accessExpiresAt = new Date(now.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000);
		const refreshExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000);

		const env = this.env as unknown as Record<string, unknown>;
		// Prefer ctx.env; in next dev, .env.local is in process.env but may not be merged into ctx.env
		const envKid =
			(typeof env.JWT_KID === "string" ? env.JWT_KID : null) ??
			(typeof process.env.JWT_KID === "string" ? process.env.JWT_KID : null);

		// Prefer R2 for kid when available so token kid matches public JWKS; use env JWT_KID only when R2 is missing (e.g. local dev)
		let kid: string;
		const r2Obj = await params.authAssets.get(params.jwksR2Key);
		if (r2Obj) {
			const jwks = (await new Response(r2Obj.body).json()) as { keys: Array<{ kid?: string }> };
			kid = jwks?.keys?.[0]?.kid ?? envKid ?? "default";
			console.log("[oauth_token] JWT issuance: kid from R2 JWKS", {
				source: "R2",
				r2Key: params.jwksR2Key,
				kid,
				keyCount: jwks?.keys?.length ?? 0,
			});
		} else if (envKid) {
			kid = envKid;
			console.log("[oauth_token] JWT issuance: kid from env (JWT_KID), R2 not available", {
				source: "env",
				kid,
			});
		} else {
			console.log("[oauth_token] JWT issuance: JWKS not available", {
				r2Key: params.jwksR2Key,
				hasR2Object: false,
				hasJWT_KID: false,
			});
			throw new OAuthServiceError("server_error", "JWKS not available.", 500);
		}

		const privateKey = await importPKCS8(params.privateKeyPem, "RS256");
		const scopeStr = params.scopeNames.join(" ");
		const payload: Record<string, string | undefined> = {
			scope: scopeStr || undefined,
			client_id: params.clientIdentifier,
		};
		if (params.environmentName != null && params.environmentName !== "") {
			payload.environment = params.environmentName;
		}
		// RFC 8707: bind the token audience to the requested resource when present, so a
		// resource server can reject tokens minted for other resources. `client_id` stays a
		// separate claim (above) for auditing. Falls back to the client_id (legacy behavior).
		const audience = params.resource ?? params.clientIdentifier;
		const accessTokenJwt = await new SignJWT(payload)
			.setProtectedHeader({ alg: "RS256", kid })
			.setIssuer(params.issuer)
			.setSubject(params.subject ?? "")
			.setAudience(audience)
			.setJti(jti)
			.setIssuedAt(Math.floor(now.getTime() / 1000))
			.setExpirationTime(Math.floor(accessExpiresAt.getTime() / 1000))
			.sign(privateKey);

		await this.tokenRepo.createAccessToken(
			{
				id: accessTokenRowId,
				token_id: jti,
				client_id: params.clientId,
				expires_at: accessExpiresAt.toISOString(),
				resource: params.resource ?? null,
			},
			params.clientScopeIds
		);
		logTokenStep("issue_create_access_token", t0);

		await this.refreshTokenRepo.createRefreshToken(
			{
				id: refreshTokenId,
				refresh_token_id: refreshToken,
				client_id: params.clientId,
				subject: params.subject,
				access_token_id: accessTokenRowId,
				expires_at: refreshExpiresAt.toISOString(),
				revoked_at: null,
				rotated_from_id: params.rotatedFromRefreshTokenId ?? null,
				created_at: now.toISOString(),
				resource: params.resource ?? null,
			},
			params.clientScopeIds
		);
		logTokenStep("issue_create_refresh_token", t0);

		// OIDC: when the `openid` scope was granted on an interactive (authorization_code)
		// exchange, also mint a signed id_token using the same key/kid as the access token.
		let idToken: string | undefined;
		if (params.issueIdToken && params.scopeNames.includes("openid") && params.subject) {
			idToken = await this.buildIdToken({
				privateKey,
				kid,
				issuer: params.issuer,
				subject: params.subject,
				audience: params.clientIdentifier,
				scopeNames: params.scopeNames,
				nonce: params.nonce ?? null,
				authTime: params.authTime ?? null,
				accessToken: accessTokenJwt,
				issuedAt: Math.floor(now.getTime() / 1000),
				expiresAt: Math.floor(accessExpiresAt.getTime() / 1000),
			});
		}

		logTokenStep("issue_token_pair_total", t0);

		return {
			token_type: "Bearer",
			access_token: accessTokenJwt,
			expires_in: ACCESS_TOKEN_TTL_SECONDS,
			refresh_token: refreshToken,
			scope: scopesToString(params.scopeNames),
			...(idToken ? { id_token: idToken } : {}),
		};
	}

	/**
	 * Build a signed OIDC id_token (Core 1.0 §2, §3.1.3.6). Standard claims are always
	 * present (`iss`, `sub`, `aud`, `exp`, `iat`, `at_hash`, plus `auth_time`/`nonce` when
	 * available); profile/email claims are gated on the corresponding granted scopes and
	 * mirror /userinfo so `sub` is consistent across both. `sub` is the user id.
	 */
	private async buildIdToken(params: {
		privateKey: CryptoKey | Uint8Array;
		kid: string;
		issuer: string;
		subject: string;
		audience: string;
		scopeNames: string[];
		nonce: string | null;
		authTime: string | null;
		accessToken: string;
		issuedAt: number;
		expiresAt: number;
	}): Promise<string> {
		const user = await this.userRepo.getById(params.subject);
		const claims: Record<string, unknown> = {
			at_hash: await computeAtHash(params.accessToken),
		};
		if (params.nonce) {
			claims.nonce = params.nonce;
		}
		if (params.authTime) {
			const authTimeSeconds = Math.floor(new Date(params.authTime).getTime() / 1000);
			if (Number.isFinite(authTimeSeconds)) {
				claims.auth_time = authTimeSeconds;
			}
		}
		if (user) {
			if (params.scopeNames.includes("profile")) {
				claims.name = user.name ?? user.username;
				claims.preferred_username = user.username;
				const picture = getAvatarUrl(user.avatarKey, this.env as unknown as Record<string, unknown>);
				if (picture) {
					claims.picture = picture;
				}
			}
			if (params.scopeNames.includes("email")) {
				claims.email = user.email ?? undefined;
				claims.email_verified = Boolean(user.emailVerifiedAt);
			}
		}
		return new SignJWT(claims)
			.setProtectedHeader({ alg: "RS256", kid: params.kid })
			.setIssuer(params.issuer)
			.setSubject(params.subject)
			.setAudience(params.audience)
			.setIssuedAt(params.issuedAt)
			.setExpirationTime(params.expiresAt)
			.sign(params.privateKey as Parameters<SignJWT["sign"]>[0]);
	}

	private async exchangeClientCredentials(params: TokenRequestParams): Promise<OAuthTokenResponse> {
		const t0 = Date.now();
		logTokenStep("client_credentials_start", t0);
		const client = await this.authenticateClient(params.clientId, params.clientSecret);
		// Public clients have no credentials to present for a two-legged grant.
		if (client.tokenEndpointAuthMethod === "none") {
			throw new OAuthServiceError(
				"unauthorized_client",
				"Public clients cannot use the client_credentials grant.",
				400
			);
		}
		const resource = normalizeResourceParam(params.resource);
		const requestedScopes = parseScopeParam(params.scope);
		let step = Date.now();
		const allGrants = await this.tokenRepo.getClientScopeGrants(client.id);
		logTokenStep("client_credentials_get_scope_grants", step);
		const selected = this.selectScopeGrants(
			allGrants,
			requestedScopes,
			"Requested scopes are not allowed for this client."
		);
		step = Date.now();
		const result = await this.issueTokenPair({
			clientId: client.id,
			clientScopeIds: selected.map((grant) => grant.clientScopeId),
			scopeNames: selected.map((grant) => grant.scopeName),
			subject: null,
			clientIdentifier: client.clientId,
			resource,
		});
		logTokenStep("client_credentials_total", t0);
		return result;
	}

	private async exchangeAuthorizationCode(params: TokenRequestParams): Promise<OAuthTokenResponse> {
		const t0 = Date.now();
		logTokenStep("authorization_code_start", t0);
		const client = await this.authenticateClient(params.clientId, params.clientSecret);
		if (!params.code) {
			throw new OAuthServiceError("invalid_request", "Missing code.", 400);
		}
		if (!params.redirectUri) {
			throw new OAuthServiceError("invalid_request", "Missing redirect_uri.", 400);
		}
		if (!params.codeVerifier) {
			throw new OAuthServiceError("invalid_request", "Missing code_verifier.", 400);
		}

		let step = Date.now();
		const authorizationCode = await this.authorizationCodeRepo.getByCodeId(params.code);
		logTokenStep("authorization_code_lookup", step);
		if (!authorizationCode) {
			throw new OAuthServiceError("invalid_grant", "Authorization code is invalid.", 400);
		}

		const nowIso = new Date().toISOString();
		if (authorizationCode.usedAt) {
			throw new OAuthServiceError("invalid_grant", "Authorization code has already been used.", 400);
		}
		if (authorizationCode.expiresAt <= nowIso) {
			throw new OAuthServiceError("invalid_grant", "Authorization code has expired.", 400);
		}
		if (authorizationCode.clientId !== client.id) {
			throw new OAuthServiceError("invalid_grant", "Authorization code does not belong to this client.", 400);
		}
		if (authorizationCode.redirectUri !== params.redirectUri) {
			throw new OAuthServiceError("invalid_grant", "redirect_uri does not match code.", 400);
		}
		if (authorizationCode.codeChallengeMethod !== "S256") {
			throw new OAuthServiceError("invalid_grant", "Unsupported PKCE challenge method.", 400);
		}
		step = Date.now();
		const computedChallenge = await toS256Challenge(params.codeVerifier);
		logTokenStep("authorization_code_pkce_verify", step);
		if (computedChallenge !== authorizationCode.codeChallenge) {
			throw new OAuthServiceError("invalid_grant", "code_verifier does not match code_challenge.", 400);
		}

		// RFC 8707: if the token request repeats `resource`, it must match the value bound to
		// the code at /authorize time. The token's `aud` is always the code-bound resource.
		if (params.resource != null) {
			const requestedResource = normalizeResourceParam(params.resource);
			if (requestedResource !== authorizationCode.resource) {
				throw new OAuthServiceError(
					"invalid_target",
					"resource does not match the value bound to the authorization code.",
					400
				);
			}
		}

		step = Date.now();
		const allClientGrants = await this.tokenRepo.getClientScopeGrants(client.id);
		logTokenStep("authorization_code_get_scope_grants", step);
		const grantsById = new Map(allClientGrants.map((grant) => [grant.clientScopeId, grant]));
		const codeGrants = authorizationCode.clientScopeIds
			.map((scopeId) => grantsById.get(scopeId))
			.filter((grant): grant is ClientScopeGrant => grant != null);

		const requestedScopes = parseScopeParam(params.scope);
		const selected = this.selectScopeGrants(
			codeGrants,
			requestedScopes,
			"Requested scopes exceed the authorization code grant."
		);

		step = Date.now();
		// Consume the code BEFORE issuing tokens. The conditional UPDATE is the real
		// single-use guard; the earlier in-memory usedAt check is just a fast-path.
		const consumed = await this.authorizationCodeRepo.markUsed(authorizationCode.id, nowIso);
		logTokenStep("authorization_code_mark_used", step);
		if (!consumed) {
			throw new OAuthServiceError("invalid_grant", "Authorization code has already been used.", 400);
		}
		step = Date.now();
		const result = await this.issueTokenPair({
			clientId: client.id,
			clientScopeIds: selected.map((grant) => grant.clientScopeId),
			scopeNames: selected.map((grant) => grant.scopeName),
			subject: authorizationCode.subject,
			clientIdentifier: client.clientId,
			// OIDC: only the authorization_code grant issues an id_token, bound to the
			// nonce/auth_time captured at /authorize time.
			issueIdToken: true,
			nonce: authorizationCode.nonce,
			authTime: authorizationCode.authTime,
			// RFC 8707: mint the access token for the resource bound at /authorize time.
			resource: authorizationCode.resource,
		});
		logTokenStep("authorization_code_total", t0);
		return result;
	}

	/**
	 * On detected refresh-token reuse, OAuth 2.1 §4.3.1 says to revoke the whole rotation
	 * family. revokeFamily only touches refresh_tokens, so the access tokens already issued
	 * across the family would survive (up to their 1h TTL). Force-expire those too so a
	 * stolen-then-rotated token's outstanding access tokens die with the family.
	 */
	private async revokeFamilyAndAccessTokens(rootId: string, nowIso: string): Promise<void> {
		await this.refreshTokenRepo.revokeFamily(rootId, nowIso);
		const accessTokenIds = await this.refreshTokenRepo.listFamilyAccessTokenIds(rootId);
		if (accessTokenIds.length > 0) {
			await this.tokenRepo.expireAccessTokensByIds(accessTokenIds, nowIso);
		}
	}

	private async exchangeRefreshToken(params: TokenRequestParams): Promise<OAuthTokenResponse> {
		const t0 = Date.now();
		logTokenStep("refresh_token_start", t0);
		const client = await this.authenticateClient(params.clientId, params.clientSecret);
		if (!params.refreshToken) {
			throw new OAuthServiceError("invalid_request", "Missing refresh_token.", 400);
		}

		let step = Date.now();
		const token = await this.refreshTokenRepo.getByTokenId(params.refreshToken);
		logTokenStep("refresh_token_lookup", step);
		if (!token) {
			throw new OAuthServiceError("invalid_grant", "Refresh token is invalid.", 400);
		}
		const nowIso = new Date().toISOString();
		if (token.clientId !== client.id) {
			throw new OAuthServiceError("invalid_grant", "Refresh token does not belong to this client.", 400);
		}
		if (token.revokedAt) {
			// A revoked refresh token was presented → reuse (OAuth 2.1 §4.3.1). Cascade-revoke
			// the whole rotation family — and its access tokens — so any sibling still live is
			// killed too.
			await this.revokeFamilyAndAccessTokens(token.id, nowIso);
			throw new OAuthServiceError("invalid_grant", "Refresh token has been revoked.", 400);
		}
		if (token.expiresAt <= nowIso) {
			throw new OAuthServiceError("invalid_grant", "Refresh token has expired.", 400);
		}

		// Re-check environment access on every refresh. Access is enforced when the
		// authorization code is minted (OauthAuthorizationService.authorize), but a refresh
		// token lives 30 days — without this re-check, revoking a user's access to the
		// client's environment would not take effect until the token naturally expires.
		// client_credentials tokens have no subject and are not per-user environment-gated.
		if (token.subject) {
			const userEnvironmentIds = await this.userRepo.getUserEnvironments(token.subject);
			if (!userEnvironmentIds.includes(client.environmentId)) {
				// The grant is no longer authorized. Revoke the presented token so this
				// session stops rotating; the user must re-authorize (which re-checks access).
				await this.refreshTokenRepo.revoke(token.id, nowIso);
				throw new OAuthServiceError(
					"invalid_grant",
					"User no longer has access to this environment.",
					400
				);
			}
		}

		step = Date.now();
		const allClientGrants = await this.tokenRepo.getClientScopeGrants(client.id);
		logTokenStep("refresh_token_get_scope_grants", step);
		const grantsById = new Map(allClientGrants.map((grant) => [grant.clientScopeId, grant]));
		const refreshGrants = token.clientScopeIds
			.map((scopeId) => grantsById.get(scopeId))
			.filter((grant): grant is ClientScopeGrant => grant != null);
		const requestedScopes = parseScopeParam(params.scope);
		const selected = this.selectScopeGrants(
			refreshGrants,
			requestedScopes,
			"Requested scopes exceed the refresh token grant."
		);

		step = Date.now();
		// Revoke the presented token BEFORE issuing its replacement. The conditional
		// revoke is the real rotation guard; the earlier revokedAt check is a fast-path.
		const revoked = await this.refreshTokenRepo.revoke(token.id, nowIso);
		logTokenStep("refresh_token_revoke_old", step);
		if (!revoked) {
			// It was already revoked between our check and now → reuse of a rotated token.
			// Cascade-revoke the whole rotation family and its access tokens (OAuth 2.1 §4.3.1
			// stolen-token response).
			await this.revokeFamilyAndAccessTokens(token.id, nowIso);
			throw new OAuthServiceError("invalid_grant", "Refresh token has been revoked.", 400);
		}
		step = Date.now();
		const result = await this.issueTokenPair({
			clientId: client.id,
			clientScopeIds: selected.map((grant) => grant.clientScopeId),
			scopeNames: selected.map((grant) => grant.scopeName),
			subject: token.subject,
			rotatedFromRefreshTokenId: token.id,
			clientIdentifier: client.clientId,
			// RFC 8707: preserve the bound audience across refresh rotation.
			resource: token.resource,
		});
		logTokenStep("refresh_token_total", t0);
		return result;
	}

	async exchange(params: TokenRequestParams): Promise<OAuthTokenResponse> {
		const t0 = Date.now();
		logTokenStep("exchange_dispatch", t0, { grant_type: params.grantType ?? "null" });
		switch (params.grantType) {
			case "client_credentials":
				return this.exchangeClientCredentials(params);
			case "authorization_code":
				return this.exchangeAuthorizationCode(params);
			case "refresh_token":
				return this.exchangeRefreshToken(params);
			default:
				throw new OAuthServiceError("unsupported_grant_type", "Unsupported grant_type.", 400);
		}
	}

	async listTokenActivity(clientId?: string): Promise<TokenActivityItem[]> {
		const [access, refresh] = await Promise.all([
			this.tokenRepo.listAccessTokenActivity(clientId),
			this.refreshTokenRepo.listRefreshTokenActivity(clientId),
		]);

		const items: TokenActivityItem[] = [
			...access.map((token) => this.mapAccessTokenActivity(token)),
			...refresh.map((token) => this.mapRefreshTokenActivity(token)),
		];
		return items.sort((a, b) => {
			const left = a.createdAt ?? a.expiresAt;
			const right = b.createdAt ?? b.expiresAt;
			return right.localeCompare(left);
		});
	}

	private mapAccessTokenActivity(token: AccessTokenActivity): TokenActivityItem {
		return {
			tokenType: "access",
			tokenId: token.tokenId,
			clientId: token.clientId,
			clientName: token.clientName ?? null,
			environmentId: token.environmentId,
			expiresAt: token.expiresAt,
			status: token.status,
			scopeNames: token.scopeNames,
			createdAt: null,
			rotatedFromTokenId: null,
		};
	}

	private mapRefreshTokenActivity(token: RefreshTokenActivity): TokenActivityItem {
		return {
			tokenType: "refresh",
			tokenId: token.tokenId,
			clientId: token.clientId,
			clientName: token.clientName ?? null,
			environmentId: token.environmentId,
			expiresAt: token.expiresAt,
			status: token.status,
			scopeNames: token.scopeNames,
			createdAt: token.createdAt,
			rotatedFromTokenId: token.rotatedFromTokenId,
		};
	}

	async revokeTokenByValue(token: string | null): Promise<RevokeTokenResult> {
		const normalized = token?.trim() ?? "";
		if (!normalized) {
			return { revoked: false, tokenType: null };
		}

		const nowIso = new Date().toISOString();
		const refreshToken = await this.refreshTokenRepo.getByTokenId(normalized);
		if (refreshToken) {
			if (!refreshToken.revokedAt) {
				await this.refreshTokenRepo.revoke(refreshToken.id, nowIso);
			}
			return { revoked: true, tokenType: "refresh" };
		}

		const accessTokenId = isJwtFormat(normalized)
			? (() => {
					try {
						const { jti } = decodeJwt(normalized);
						return typeof jti === "string" ? jti : null;
					} catch {
						return null;
					}
				})()
			: normalized;

		const revoked = await this.tokenRepo.revokeAccessTokenByTokenId(accessTokenId ?? normalized, nowIso);
		if (revoked) {
			return { revoked: true, tokenType: "access" };
		}

		return { revoked: false, tokenType: null };
	}

	async deleteTokenByValue(token: string | null): Promise<DeleteTokenResult> {
		const normalized = token?.trim() ?? "";
		if (!normalized) {
			return { deleted: false, tokenType: null };
		}

		const refreshDeleted = await this.refreshTokenRepo.deleteByTokenId(normalized);
		if (refreshDeleted) {
			return { deleted: true, tokenType: "refresh" };
		}

		const accessTokenId = isJwtFormat(normalized)
			? (() => {
					try {
						const { jti } = decodeJwt(normalized);
						return typeof jti === "string" ? jti : null;
					} catch {
						return null;
					}
				})()
			: normalized;

		const accessDeleted = await this.tokenRepo.deleteAccessTokenByTokenId(accessTokenId ?? normalized);
		if (accessDeleted) {
			return { deleted: true, tokenType: "access" };
		}

		return { deleted: false, tokenType: null };
	}

	async cleanupTokenArtifacts(dryRun = false): Promise<CleanupTokenArtifactsResult> {
		const nowIso = new Date().toISOString();
		if (dryRun) {
			return {
				accessTokensDeleted: 0,
				refreshTokensExpiredDeleted: 0,
				refreshTokensRevokedDeleted: 0,
				authorizationCodesDeleted: 0,
				totalDeleted: 0,
			};
		}

		const [
			accessTokensDeleted,
			refreshTokensExpiredDeleted,
			refreshTokensRevokedDeleted,
			authorizationCodesDeleted,
		] = await Promise.all([
			this.tokenRepo.deleteExpiredAccessTokens(nowIso),
			this.refreshTokenRepo.deleteExpired(nowIso),
			this.refreshTokenRepo.deleteRevoked(),
			this.authorizationCodeRepo.deleteUsedOrExpired(nowIso),
		]);

		return {
			accessTokensDeleted,
			refreshTokensExpiredDeleted,
			refreshTokensRevokedDeleted,
			authorizationCodesDeleted,
			totalDeleted:
				accessTokensDeleted +
				refreshTokensExpiredDeleted +
				refreshTokensRevokedDeleted +
				authorizationCodesDeleted,
		};
	}

	async validateAccessToken(
		token: string | null,
		requiredScopes: string[],
		environmentName: string | null,
		expectedAudience: string | null = null
	): Promise<ValidateTokenResult> {
		const normalizedAudience = expectedAudience?.trim() || null;
		const normalizedEnvironmentName = environmentName?.trim() ?? "";
		const expectedEnvironmentName =
			normalizedEnvironmentName.length > 0 ? normalizedEnvironmentName : null;
		if (!token?.trim()) {
			return {
				valid: false,
				active: false,
				clientId: null,
				subject: null,
				environmentId: null,
				environmentMatch: false,
				expectedEnvironmentName,
				tokenEnvironmentName: null,
				expiresAt: null,
				tokenScopes: [],
				requiredScopes,
				missingScopes: requiredScopes,
			};
		}

		const trimmed = token.trim();

		if (isJwtFormat(trimmed)) {
			return this.validateAccessTokenJwt(
				trimmed,
				requiredScopes,
				expectedEnvironmentName,
				normalizedAudience
			);
		}

		const tokenRecord = await this.tokenRepo.getAccessTokenByTokenId(trimmed);
		if (!tokenRecord) {
			return {
				valid: false,
				active: false,
				clientId: null,
				subject: null,
				environmentId: null,
				environmentMatch: false,
				expectedEnvironmentName,
				tokenEnvironmentName: null,
				expiresAt: null,
				tokenScopes: [],
				requiredScopes,
				missingScopes: requiredScopes,
			};
		}

		const nowIso = new Date().toISOString();
		const active = tokenRecord.expiresAt > nowIso;
		const tokenScopeSet = new Set(tokenRecord.scopeNames);
		const missingScopes = requiredScopes.filter((scope) => !tokenScopeSet.has(scope));
		const environmentMatch =
			expectedEnvironmentName == null
				? true
				: tokenRecord.environmentName.toLocaleLowerCase() ===
					expectedEnvironmentName.toLocaleLowerCase();
		// Audience binding: a token is valid for the resource it was minted for (RFC 8707),
		// falling back to the owning client_id when no resource was requested.
		const tokenAudience = tokenRecord.resource ?? tokenRecord.clientId;
		const audienceMatch =
			normalizedAudience == null ? true : tokenAudience === normalizedAudience;
		const valid = active && missingScopes.length === 0 && environmentMatch && audienceMatch;

		return {
			valid,
			active,
			clientId: tokenRecord.clientId,
			subject: null,
			environmentId: tokenRecord.environmentId,
			environmentMatch,
			expectedEnvironmentName,
			tokenEnvironmentName: tokenRecord.environmentName,
			expiresAt: tokenRecord.expiresAt,
			tokenScopes: tokenRecord.scopeNames,
			requiredScopes,
			missingScopes,
		};
	}

	private async validateAccessTokenJwt(
		token: string,
		requiredScopes: string[],
		expectedEnvironmentName: string | null,
		expectedAudience: string | null = null
	): Promise<ValidateTokenResult> {
		const env = this.env as unknown as Record<string, unknown>;
		const authAssets = env.AUTH_ASSETS as { get(key: string): Promise<{ body: ReadableStream } | null> } | undefined;
		const jwksR2Key = (typeof env.JWKS_R2_KEY === "string" ? env.JWKS_R2_KEY : null) ?? JWKS_R2_KEY_DEFAULT;
		// Prefer ctx.env; in next dev, JWT_JWKS_JSON may only be in process.env (.env.local)
		const jwksJsonRaw =
			(typeof env.JWT_JWKS_JSON === "string" && env.JWT_JWKS_JSON.trim().length > 0
				? env.JWT_JWKS_JSON
				: typeof process.env.JWT_JWKS_JSON === "string" && process.env.JWT_JWKS_JSON.trim().length > 0
					? process.env.JWT_JWKS_JSON
					: null) as string | null;
		const jwksFromEnv = jwksJsonRaw
			? (() => {
					try {
						return JSON.parse(jwksJsonRaw) as { keys: unknown[] };
					} catch {
						return null;
					}
				})()
			: null;

		if (jwksFromEnv?.keys?.length) {
			const kids = (jwksFromEnv.keys as { kid?: string }[]).map((k) => k.kid ?? "(no kid)");
			const fromProcessEnv = !!(
				typeof process.env.JWT_JWKS_JSON === "string" &&
				process.env.JWT_JWKS_JSON.trim().length > 0 &&
				!(typeof env.JWT_JWKS_JSON === "string" && env.JWT_JWKS_JSON.trim().length > 0)
			);
			console.log("[oauth_token] JWT verification: JWKS source=env (JWT_JWKS_JSON)", {
				keyCount: jwksFromEnv.keys.length,
				kids,
				fromProcessEnv,
			});
		} else if (authAssets) {
			console.log("[oauth_token] JWT verification: no JWKS from env, trying R2", {
				binding: "AUTH_ASSETS",
				r2Key: jwksR2Key,
			});
		} else {
			console.log("[oauth_token] JWT verification: no JWKS from env, AUTH_ASSETS binding not available");
		}

		const invalidResult = (): ValidateTokenResult => ({
			valid: false,
			active: false,
			clientId: null,
			subject: null,
			environmentId: null,
			environmentMatch: false,
			expectedEnvironmentName,
			tokenEnvironmentName: null,
			expiresAt: null,
			tokenScopes: [],
			requiredScopes,
			missingScopes: requiredScopes,
		});

		const validateFromRecord = (tokenRecord: {
			clientId: string;
			environmentId: string;
			environmentName: string;
			expiresAt: string;
			scopeNames: string[];
			resource: string | null;
		}, subject: string | null): ValidateTokenResult => {
			const nowIso = new Date().toISOString();
			const active = tokenRecord.expiresAt > nowIso;
			const tokenScopeSet = new Set(tokenRecord.scopeNames);
			const missingScopes = requiredScopes.filter((scope) => !tokenScopeSet.has(scope));
			const environmentMatch =
				expectedEnvironmentName == null
					? true
					: tokenRecord.environmentName.toLocaleLowerCase() ===
						expectedEnvironmentName.toLocaleLowerCase();
			// Audience binding: the token's audience is its bound resource (RFC 8707), which
			// equals the JWT `aud`, falling back to the owning client_id. Prevents a token
			// minted for resource/client A from being accepted by resource server B.
			const tokenAudience = tokenRecord.resource ?? tokenRecord.clientId;
			const audienceMatch =
				expectedAudience == null ? true : tokenAudience === expectedAudience;
			const valid = active && missingScopes.length === 0 && environmentMatch && audienceMatch;
			if (!valid) {
				console.warn("[oauth_token] JWT validation: token found but valid=false.", {
					active,
					environmentMatch,
					audienceMatch,
					expectedEnvironmentName,
					tokenEnvironmentName: tokenRecord.environmentName,
					missingScopes: missingScopes.length ? missingScopes : undefined,
				});
			}
			return {
				valid,
				active,
				clientId: tokenRecord.clientId,
				subject,
				environmentId: tokenRecord.environmentId,
				environmentMatch,
				expectedEnvironmentName,
				tokenEnvironmentName: tokenRecord.environmentName,
				expiresAt: tokenRecord.expiresAt,
				tokenScopes: tokenRecord.scopeNames,
				requiredScopes,
				missingScopes,
			};
		};

		const fallbackToDbLookup = async (reason: string): Promise<ValidateTokenResult> => {
			console.warn("[oauth_token] JWT validation: public key not available, falling back to DB lookup by jti.", {
				reason,
			});
			let jti: string | undefined;
			try {
				const payload = decodeJwt(token);
				jti = typeof payload.jti === "string" ? payload.jti : undefined;
			} catch {
				return invalidResult();
			}
			if (!jti) return invalidResult();
			const tokenRecord = await this.tokenRepo.getAccessTokenByTokenId(jti);
			if (!tokenRecord) return invalidResult();
			return validateFromRecord(tokenRecord, null);
		};

		// Prefer JWKS from env (e.g. JWT_JWKS_JSON in .env.local) so next dev uses same key as signing
		let jwks: { keys: unknown[] } | null = jwksFromEnv;

		if (!jwks?.keys?.length && authAssets) {
			const r2Obj = await authAssets.get(jwksR2Key);
			if (r2Obj) {
				jwks = (await new Response(r2Obj.body).json()) as { keys: unknown[] };
				const kids = (jwks?.keys as { kid?: string }[] | undefined)?.map((k) => k.kid ?? "(no kid)") ?? [];
				console.log("[oauth_token] JWT verification: JWKS source=R2", {
					r2Key: jwksR2Key,
					keyCount: jwks?.keys?.length ?? 0,
					kids,
				});
			} else {
				console.log("[oauth_token] JWT verification: R2 get returned null", { r2Key: jwksR2Key });
			}
		}

		if (!jwks?.keys?.length) {
			console.log("[oauth_token] JWT verification: no JWKS available, will fall back to DB lookup if possible");
			return fallbackToDbLookup(
				jwksFromEnv ? "JWT_JWKS_JSON invalid or empty" : "JWKS not in env and not available from R2"
			);
		}

		const jwksSource = jwksFromEnv?.keys?.length ? "env (JWT_JWKS_JSON)" : "R2";

		try {
			const JWKS = createLocalJWKSet(jwks as Parameters<typeof createLocalJWKSet>[0]);
			// Pin the accepted signature algorithm to RS256 (the only alg we sign with).
			// Defends against alg-confusion / "alg: none" even if a non-RSA key is ever
			// published to the JWKS.
			const { payload } = await jwtVerify(token, JWKS, { algorithms: ["RS256"] });
			const jti = payload.jti as string | undefined;
			if (!jti) return invalidResult();
			const subject = typeof payload.sub === "string" ? payload.sub : null;

			const tokenRecord = await this.tokenRepo.getAccessTokenByTokenId(jti);
			if (!tokenRecord) return invalidResult();
			console.log("[oauth_token] JWT verification: signature verified", { jwksSource, jti });
			return validateFromRecord(tokenRecord, subject);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			const code = err && typeof err === "object" && "code" in err ? (err as { code: string }).code : undefined;
			let decoded: Record<string, unknown> | null = null;
			try {
				const payload = decodeJwt(token);
				decoded = { iss: payload.iss, aud: payload.aud, exp: payload.exp, iat: payload.iat, jti: payload.jti };
			} catch {
				// ignore decode errors
			}
			console.warn("[oauth_token] JWT verification failed.", {
				code,
				message,
				name: err instanceof Error ? err.name : undefined,
				decoded,
			});
			return invalidResult();
		}
	}
}
