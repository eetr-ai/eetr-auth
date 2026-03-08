import { SignJWT, importPKCS8, jwtVerify, createLocalJWKSet, decodeJwt } from "jose";
import { getDb } from "@/lib/db";
import type { RequestContext } from "@/lib/context/types";
import { ClientRepositoryD1 } from "@/lib/repositories/client.repository.d1";
import { AuthorizationCodeRepositoryD1 } from "@/lib/repositories/authorization-code.repository.d1";
import { TokenRepositoryD1 } from "@/lib/repositories/token.repository.d1";
import { RefreshTokenRepositoryD1 } from "@/lib/repositories/refresh-token.repository.d1";
import { EnvironmentRepositoryD1 } from "@/lib/repositories/environment.repository.d1";
import type { ClientScopeGrant } from "@/lib/repositories/token.repository";
import type {
	RefreshTokenActivity,
} from "@/lib/repositories/refresh-token.repository";
import type { AccessTokenActivity } from "@/lib/repositories/token.repository";
import { OAuthServiceError } from "./oauth.types";

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

async function toS256Challenge(value: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(value);
	const digest = await crypto.subtle.digest("SHA-256", data);
	const bytes = new Uint8Array(digest);
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export interface OAuthTokenResponse {
	token_type: "Bearer";
	access_token: string;
	expires_in: number;
	refresh_token: string;
	scope?: string;
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

export class OauthTokenService {
	private readonly ctx: RequestContext;
	private readonly clientRepo: ClientRepositoryD1;
	private readonly authorizationCodeRepo: AuthorizationCodeRepositoryD1;
	private readonly tokenRepo: TokenRepositoryD1;
	private readonly refreshTokenRepo: RefreshTokenRepositoryD1;
	private readonly envRepo: EnvironmentRepositoryD1;

	constructor(ctx: RequestContext) {
		this.ctx = ctx;
		const db = getDb(ctx.env);
		this.clientRepo = new ClientRepositoryD1(db);
		this.authorizationCodeRepo = new AuthorizationCodeRepositoryD1(db);
		this.tokenRepo = new TokenRepositoryD1(db);
		this.refreshTokenRepo = new RefreshTokenRepositoryD1(db);
		this.envRepo = new EnvironmentRepositoryD1(db);
	}

	private async authenticateClient(clientId: string | null, clientSecret: string | null) {
		const t0 = Date.now();
		if (!clientId || !clientSecret) {
			throw new OAuthServiceError("invalid_client", "Missing client credentials.", 401);
		}
		const client = await this.clientRepo.getByClientIdentifier(clientId);
		logTokenStep("authenticate_client_lookup", t0);
		if (!client || client.clientSecret !== clientSecret) {
			throw new OAuthServiceError("invalid_client", "Invalid client credentials.", 401);
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
	}): Promise<OAuthTokenResponse> {
		const env = this.ctx.env as unknown as Record<string, unknown>;
		// Prefer ctx.env; in next dev, .env.local is in process.env but may not be merged into ctx.env
		const privateKeyPem =
			(typeof env.JWT_PRIVATE_KEY === "string" ? env.JWT_PRIVATE_KEY : null) ??
			(typeof process.env.JWT_PRIVATE_KEY === "string" ? process.env.JWT_PRIVATE_KEY : null);
		const blogImages = env.BLOG_IMAGES as { get(key: string): Promise<{ body: ReadableStream } | null> } | undefined;
		const issuer = (typeof env.ISSUER_BASE_URL === "string" ? env.ISSUER_BASE_URL : null) ?? "https://auth.progression-ai.com";
		const jwksR2Key = (typeof env.JWKS_R2_KEY === "string" ? env.JWKS_R2_KEY : null) ?? JWKS_R2_KEY_DEFAULT;

		const clientIdentifier = params.clientIdentifier;
		// Need kid from env (JWT_KID) or R2 when using .env.local only
		const hasKidSource =
			blogImages ||
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
				blogImages: blogImages ?? { get: async () => null },
				jwksR2Key,
			});
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
		blogImages: { get(key: string): Promise<{ body: ReadableStream } | null> };
		jwksR2Key: string;
	}): Promise<OAuthTokenResponse> {
		const t0 = Date.now();
		const now = new Date();
		const jti = crypto.randomUUID();
		const accessTokenRowId = crypto.randomUUID();
		const refreshToken = generateOpaqueSecret("rt");
		const refreshTokenId = crypto.randomUUID();
		const accessExpiresAt = new Date(now.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000);
		const refreshExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000);

		const env = this.ctx.env as unknown as Record<string, unknown>;
		// Prefer ctx.env; in next dev, .env.local is in process.env but may not be merged into ctx.env
		const envKid =
			(typeof env.JWT_KID === "string" ? env.JWT_KID : null) ??
			(typeof process.env.JWT_KID === "string" ? process.env.JWT_KID : null);

		// Prefer R2 for kid when available so token kid matches public JWKS; use env JWT_KID only when R2 is missing (e.g. local dev)
		let kid: string;
		const r2Obj = await params.blogImages.get(params.jwksR2Key);
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
		const accessTokenJwt = await new SignJWT(payload)
			.setProtectedHeader({ alg: "RS256", kid })
			.setIssuer(params.issuer)
			.setSubject(params.subject ?? "")
			.setAudience(params.clientIdentifier)
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
			},
			params.clientScopeIds
		);
		logTokenStep("issue_create_refresh_token", t0);
		logTokenStep("issue_token_pair_total", t0);

		return {
			token_type: "Bearer",
			access_token: accessTokenJwt,
			expires_in: ACCESS_TOKEN_TTL_SECONDS,
			refresh_token: refreshToken,
			scope: scopesToString(params.scopeNames),
		};
	}

	private async exchangeClientCredentials(params: TokenRequestParams): Promise<OAuthTokenResponse> {
		const t0 = Date.now();
		logTokenStep("client_credentials_start", t0);
		const client = await this.authenticateClient(params.clientId, params.clientSecret);
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
		await this.authorizationCodeRepo.markUsed(authorizationCode.id, nowIso);
		logTokenStep("authorization_code_mark_used", step);
		step = Date.now();
		const result = await this.issueTokenPair({
			clientId: client.id,
			clientScopeIds: selected.map((grant) => grant.clientScopeId),
			scopeNames: selected.map((grant) => grant.scopeName),
			subject: authorizationCode.subject,
			clientIdentifier: client.clientId,
		});
		logTokenStep("authorization_code_total", t0);
		return result;
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
			throw new OAuthServiceError("invalid_grant", "Refresh token has been revoked.", 400);
		}
		if (token.expiresAt <= nowIso) {
			throw new OAuthServiceError("invalid_grant", "Refresh token has expired.", 400);
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
		await this.refreshTokenRepo.revoke(token.id, nowIso);
		logTokenStep("refresh_token_revoke_old", step);
		step = Date.now();
		const result = await this.issueTokenPair({
			clientId: client.id,
			clientScopeIds: selected.map((grant) => grant.clientScopeId),
			scopeNames: selected.map((grant) => grant.scopeName),
			subject: token.subject,
			rotatedFromRefreshTokenId: token.id,
			clientIdentifier: client.clientId,
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
		environmentName: string | null
	): Promise<ValidateTokenResult> {
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
			return this.validateAccessTokenJwt(trimmed, requiredScopes, expectedEnvironmentName);
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
		const valid = active && missingScopes.length === 0 && environmentMatch;

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
		expectedEnvironmentName: string | null
	): Promise<ValidateTokenResult> {
		const env = this.ctx.env as unknown as Record<string, unknown>;
		const blogImages = env.BLOG_IMAGES as { get(key: string): Promise<{ body: ReadableStream } | null> } | undefined;
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
		} else if (blogImages) {
			console.log("[oauth_token] JWT verification: no JWKS from env, trying R2", {
				binding: "BLOG_IMAGES",
				r2Key: jwksR2Key,
			});
		} else {
			console.log("[oauth_token] JWT verification: no JWKS from env, BLOG_IMAGES binding not available");
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
			const valid = active && missingScopes.length === 0 && environmentMatch;
			if (!valid) {
				console.warn("[oauth_token] JWT validation: token found but valid=false.", {
					active,
					environmentMatch,
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

		if (!jwks?.keys?.length && blogImages) {
			const r2Obj = await blogImages.get(jwksR2Key);
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
			const { payload } = await jwtVerify(token, JWKS);
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
