import { getDb } from "@/lib/db";
import type { RequestContext } from "@/lib/context/types";
import { ClientRepositoryD1 } from "@/lib/repositories/client.repository.d1";
import { AuthorizationCodeRepositoryD1 } from "@/lib/repositories/authorization-code.repository.d1";
import { TokenRepositoryD1 } from "@/lib/repositories/token.repository.d1";
import { RefreshTokenRepositoryD1 } from "@/lib/repositories/refresh-token.repository.d1";
import type { ClientScopeGrant } from "@/lib/repositories/token.repository";
import type {
	RefreshTokenActivity,
} from "@/lib/repositories/refresh-token.repository";
import type { AccessTokenActivity } from "@/lib/repositories/token.repository";
import { OAuthServiceError } from "./oauth.types";

const ACCESS_TOKEN_TTL_SECONDS = 3600;
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

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
	private readonly clientRepo: ClientRepositoryD1;
	private readonly authorizationCodeRepo: AuthorizationCodeRepositoryD1;
	private readonly tokenRepo: TokenRepositoryD1;
	private readonly refreshTokenRepo: RefreshTokenRepositoryD1;

	constructor(ctx: RequestContext) {
		const db = getDb(ctx.env);
		this.clientRepo = new ClientRepositoryD1(db);
		this.authorizationCodeRepo = new AuthorizationCodeRepositoryD1(db);
		this.tokenRepo = new TokenRepositoryD1(db);
		this.refreshTokenRepo = new RefreshTokenRepositoryD1(db);
	}

	private async authenticateClient(clientId: string | null, clientSecret: string | null) {
		if (!clientId || !clientSecret) {
			throw new OAuthServiceError("invalid_client", "Missing client credentials.", 401);
		}
		const client = await this.clientRepo.getByClientIdentifier(clientId);
		if (!client || client.clientSecret !== clientSecret) {
			throw new OAuthServiceError("invalid_client", "Invalid client credentials.", 401);
		}
		const nowIso = new Date().toISOString();
		if (client.expiresAt && client.expiresAt <= nowIso) {
			throw new OAuthServiceError("invalid_client", "Client credentials have expired.", 401);
		}
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
	}): Promise<OAuthTokenResponse> {
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

		return {
			token_type: "Bearer",
			access_token: accessToken,
			expires_in: ACCESS_TOKEN_TTL_SECONDS,
			refresh_token: refreshToken,
			scope: scopesToString(params.scopeNames),
		};
	}

	private async exchangeClientCredentials(params: TokenRequestParams): Promise<OAuthTokenResponse> {
		const client = await this.authenticateClient(params.clientId, params.clientSecret);
		const requestedScopes = parseScopeParam(params.scope);
		const allGrants = await this.tokenRepo.getClientScopeGrants(client.id);
		const selected = this.selectScopeGrants(
			allGrants,
			requestedScopes,
			"Requested scopes are not allowed for this client."
		);
		return this.issueTokenPair({
			clientId: client.id,
			clientScopeIds: selected.map((grant) => grant.clientScopeId),
			scopeNames: selected.map((grant) => grant.scopeName),
			subject: null,
		});
	}

	private async exchangeAuthorizationCode(params: TokenRequestParams): Promise<OAuthTokenResponse> {
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

		const authorizationCode = await this.authorizationCodeRepo.getByCodeId(params.code);
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
		const computedChallenge = await toS256Challenge(params.codeVerifier);
		if (computedChallenge !== authorizationCode.codeChallenge) {
			throw new OAuthServiceError("invalid_grant", "code_verifier does not match code_challenge.", 400);
		}

		const allClientGrants = await this.tokenRepo.getClientScopeGrants(client.id);
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

		await this.authorizationCodeRepo.markUsed(authorizationCode.id, nowIso);
		return this.issueTokenPair({
			clientId: client.id,
			clientScopeIds: selected.map((grant) => grant.clientScopeId),
			scopeNames: selected.map((grant) => grant.scopeName),
			subject: authorizationCode.subject,
		});
	}

	private async exchangeRefreshToken(params: TokenRequestParams): Promise<OAuthTokenResponse> {
		const client = await this.authenticateClient(params.clientId, params.clientSecret);
		if (!params.refreshToken) {
			throw new OAuthServiceError("invalid_request", "Missing refresh_token.", 400);
		}

		const token = await this.refreshTokenRepo.getByTokenId(params.refreshToken);
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

		const allClientGrants = await this.tokenRepo.getClientScopeGrants(client.id);
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

		await this.refreshTokenRepo.revoke(token.id, nowIso);
		return this.issueTokenPair({
			clientId: client.id,
			clientScopeIds: selected.map((grant) => grant.clientScopeId),
			scopeNames: selected.map((grant) => grant.scopeName),
			subject: token.subject,
			rotatedFromRefreshTokenId: token.id,
		});
	}

	async exchange(params: TokenRequestParams): Promise<OAuthTokenResponse> {
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

		const revoked = await this.tokenRepo.revokeAccessTokenByTokenId(normalized, nowIso);
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

		const accessDeleted = await this.tokenRepo.deleteAccessTokenByTokenId(normalized);
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
		if (!expectedEnvironmentName) {
			return {
				valid: false,
				active: false,
				clientId: null,
				environmentId: null,
				environmentMatch: false,
				expectedEnvironmentName: null,
				tokenEnvironmentName: null,
				expiresAt: null,
				tokenScopes: [],
				requiredScopes,
				missingScopes: requiredScopes,
			};
		}
		if (!token?.trim()) {
			return {
				valid: false,
				active: false,
				clientId: null,
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

		const tokenRecord = await this.tokenRepo.getAccessTokenByTokenId(token.trim());
		if (!tokenRecord) {
			return {
				valid: false,
				active: false,
				clientId: null,
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
			expectedEnvironmentName != null &&
			tokenRecord.environmentName.toLocaleLowerCase() ===
				expectedEnvironmentName.toLocaleLowerCase();
		const valid = active && missingScopes.length === 0 && environmentMatch;

		return {
			valid,
			active,
			clientId: tokenRecord.clientId,
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
}
