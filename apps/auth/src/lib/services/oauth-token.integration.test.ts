import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
	AuthorizationCodeRepository,
	AuthorizationCodeRow,
	AuthorizationCodeWithScopeIds,
} from "@/lib/repositories/authorization-code.repository";
import type { Client, ClientRepository, ClientRow } from "@/lib/repositories/client.repository";
import type { Environment, EnvironmentRepository } from "@/lib/repositories/environment.repository";
import type {
	RefreshTokenActivity,
	RefreshTokenRecord,
	RefreshTokenRepository,
	RefreshTokenRow,
} from "@/lib/repositories/refresh-token.repository";
import type {
	AccessTokenActivity,
	AccessTokenRecord,
	AccessTokenRow,
	ClientScopeGrant,
	TokenRepository,
} from "@/lib/repositories/token.repository";
import { OauthAuthorizationService } from "@/lib/services/oauth-authorization.service";
import { OauthTokenService } from "@/lib/services/oauth-token.service";
import { OAuthServiceError } from "@/lib/services/oauth.types";

type StoredAccessToken = {
	row: AccessTokenRow;
	clientScopeIds: string[];
};

type StoredRefreshToken = {
	row: RefreshTokenRow;
	clientScopeIds: string[];
};

type StoredAuthorizationCode = {
	row: AuthorizationCodeRow;
	clientScopeIds: string[];
};

class InMemoryEnvironmentRepo implements EnvironmentRepository {
	constructor(private readonly environments = new Map<string, Environment>()) {}

	async list(): Promise<Environment[]> {
		return [...this.environments.values()];
	}

	async getById(id: string): Promise<Environment | null> {
		return this.environments.get(id) ?? null;
	}

	async create(id: string, name: string): Promise<void> {
		this.environments.set(id, { id, name });
	}

	async update(id: string, name: string): Promise<void> {
		const current = this.environments.get(id);
		if (!current) return;
		this.environments.set(id, { ...current, name });
	}

	async delete(id: string): Promise<void> {
		this.environments.delete(id);
	}

	async countClientsByEnvironment(): Promise<number> {
		return 0;
	}
}

class InMemoryClientRepo implements ClientRepository {
	private readonly clientsById = new Map<string, Client>();
	private readonly redirectsByClientId = new Map<string, string[]>();

	constructor(initialClients: Client[]) {
		for (const client of initialClients) {
			this.clientsById.set(client.id, client);
		}
	}

	async list(environmentId?: string): Promise<Client[]> {
		return [...this.clientsById.values()].filter((client) => !environmentId || client.environmentId === environmentId);
	}

	async getById(id: string): Promise<Client | null> {
		return this.clientsById.get(id) ?? null;
	}

	async getByClientIdentifier(clientId: string): Promise<Client | null> {
		return [...this.clientsById.values()].find((client) => client.clientId === clientId) ?? null;
	}

	async create(row: ClientRow): Promise<void> {
		this.clientsById.set(row.id, {
			id: row.id,
			clientId: row.client_id,
			clientSecret: row.client_secret,
			environmentId: row.environment_id,
			createdBy: row.created_by,
			expiresAt: row.expires_at,
			name: row.name,
		});
	}

	async delete(id: string): Promise<void> {
		this.clientsById.delete(id);
		this.redirectsByClientId.delete(id);
	}

	async getRedirectUris(clientId: string): Promise<string[]> {
		return [...(this.redirectsByClientId.get(clientId) ?? [])];
	}

	async setRedirectUris(clientId: string, uris: string[]): Promise<void> {
		this.redirectsByClientId.set(clientId, [...uris]);
	}

	async getClientScopes(): Promise<{ scopeId: string }[]> {
		return [];
	}

	async setClientScopes(): Promise<void> {}

	async updateSecret(id: string, clientSecret: string): Promise<void> {
		const current = this.clientsById.get(id);
		if (!current) return;
		this.clientsById.set(id, { ...current, clientSecret });
	}

	async updateName(id: string, name: string | null): Promise<void> {
		const current = this.clientsById.get(id);
		if (!current) return;
		this.clientsById.set(id, { ...current, name });
	}
}

class InMemoryTokenRepo implements TokenRepository {
	private readonly accessTokensByTokenId = new Map<string, StoredAccessToken>();

	constructor(
		private readonly clientRepo: InMemoryClientRepo,
		private readonly envRepo: InMemoryEnvironmentRepo,
		private readonly grantsByClientId: Map<string, ClientScopeGrant[]>
	) {}

	async createAccessToken(row: AccessTokenRow, clientScopeIds: string[]): Promise<void> {
		this.accessTokensByTokenId.set(row.token_id, { row: { ...row }, clientScopeIds: [...clientScopeIds] });
	}

	async getClientScopeGrants(clientId: string): Promise<ClientScopeGrant[]> {
		return [...(this.grantsByClientId.get(clientId) ?? [])];
	}

	async getClientScopeGrantsByNames(clientId: string, scopeNames: string[]): Promise<ClientScopeGrant[]> {
		const scopeSet = new Set(scopeNames);
		return (this.grantsByClientId.get(clientId) ?? []).filter((grant) => scopeSet.has(grant.scopeName));
	}

	async getAccessTokenByTokenId(tokenId: string): Promise<AccessTokenRecord | null> {
		const stored = this.accessTokensByTokenId.get(tokenId);
		if (!stored) return null;
		const client = await this.clientRepo.getById(stored.row.client_id);
		if (!client) return null;
		const environment = await this.envRepo.getById(client.environmentId);
		const grants = this.grantsByClientId.get(client.id) ?? [];
		const scopeNames = stored.clientScopeIds
			.map((clientScopeId) => grants.find((grant) => grant.clientScopeId === clientScopeId)?.scopeName)
			.filter((scopeName): scopeName is string => Boolean(scopeName));

		return {
			id: stored.row.id,
			tokenId: stored.row.token_id,
			clientId: client.clientId,
			environmentId: client.environmentId,
			environmentName: environment?.name ?? "unknown",
			expiresAt: stored.row.expires_at,
			scopeNames,
		};
	}

	async listAccessTokenActivity(): Promise<AccessTokenActivity[]> {
		return [];
	}

	async revokeAccessTokenByTokenId(tokenId: string, expiresAt: string): Promise<boolean> {
		const stored = this.accessTokensByTokenId.get(tokenId);
		if (!stored) return false;
		stored.row.expires_at = stored.row.expires_at > expiresAt ? expiresAt : stored.row.expires_at;
		return true;
	}

	async deleteAccessTokenByTokenId(tokenId: string): Promise<boolean> {
		return this.accessTokensByTokenId.delete(tokenId);
	}

	async deleteExpiredAccessTokens(nowIso: string): Promise<number> {
		let count = 0;
		for (const [tokenId, stored] of this.accessTokensByTokenId.entries()) {
			if (stored.row.expires_at <= nowIso) {
				this.accessTokensByTokenId.delete(tokenId);
				count += 1;
			}
		}
		return count;
	}
}

class InMemoryRefreshTokenRepo implements RefreshTokenRepository {
	private readonly refreshTokensByTokenId = new Map<string, StoredRefreshToken>();

	async createRefreshToken(row: RefreshTokenRow, clientScopeIds: string[]): Promise<void> {
		this.refreshTokensByTokenId.set(row.refresh_token_id, { row: { ...row }, clientScopeIds: [...clientScopeIds] });
	}

	async getByTokenId(refreshTokenId: string): Promise<RefreshTokenRecord | null> {
		const stored = this.refreshTokensByTokenId.get(refreshTokenId);
		if (!stored) return null;
		return {
			id: stored.row.id,
			refreshTokenId: stored.row.refresh_token_id,
			clientId: stored.row.client_id,
			subject: stored.row.subject,
			accessTokenId: stored.row.access_token_id,
			expiresAt: stored.row.expires_at,
			revokedAt: stored.row.revoked_at,
			rotatedFromId: stored.row.rotated_from_id,
			createdAt: stored.row.created_at,
			clientScopeIds: [...stored.clientScopeIds],
		};
	}

	async revoke(id: string, revokedAt: string): Promise<void> {
		for (const stored of this.refreshTokensByTokenId.values()) {
			if (stored.row.id === id) {
				stored.row.revoked_at = revokedAt;
			}
		}
	}

	async listRefreshTokenActivity(): Promise<RefreshTokenActivity[]> {
		return [];
	}

	async deleteByTokenId(refreshTokenId: string): Promise<boolean> {
		return this.refreshTokensByTokenId.delete(refreshTokenId);
	}

	async deleteExpired(nowIso: string): Promise<number> {
		let count = 0;
		for (const [tokenId, stored] of this.refreshTokensByTokenId.entries()) {
			if (stored.row.expires_at <= nowIso) {
				this.refreshTokensByTokenId.delete(tokenId);
				count += 1;
			}
		}
		return count;
	}

	async deleteRevoked(): Promise<number> {
		let count = 0;
		for (const [tokenId, stored] of this.refreshTokensByTokenId.entries()) {
			if (stored.row.revoked_at) {
				this.refreshTokensByTokenId.delete(tokenId);
				count += 1;
			}
		}
		return count;
	}
}

class InMemoryAuthorizationCodeRepo implements AuthorizationCodeRepository {
	private readonly codesByCodeId = new Map<string, StoredAuthorizationCode>();

	async create(row: AuthorizationCodeRow, clientScopeIds: string[]): Promise<void> {
		this.codesByCodeId.set(row.code_id, { row: { ...row }, clientScopeIds: [...clientScopeIds] });
	}

	async getByCodeId(codeId: string): Promise<AuthorizationCodeWithScopeIds | null> {
		const stored = this.codesByCodeId.get(codeId);
		if (!stored) return null;
		return {
			id: stored.row.id,
			codeId: stored.row.code_id,
			clientId: stored.row.client_id,
			redirectUri: stored.row.redirect_uri,
			codeChallenge: stored.row.code_challenge,
			codeChallengeMethod: stored.row.code_challenge_method,
			subject: stored.row.subject,
			expiresAt: stored.row.expires_at,
			usedAt: stored.row.used_at,
			createdAt: stored.row.created_at,
			clientScopeIds: [...stored.clientScopeIds],
		};
	}

	async markUsed(id: string, usedAt: string): Promise<void> {
		for (const stored of this.codesByCodeId.values()) {
			if (stored.row.id === id) {
				stored.row.used_at = usedAt;
			}
		}
	}

	async deleteUsedOrExpired(nowIso: string): Promise<number> {
		let count = 0;
		for (const [codeId, stored] of this.codesByCodeId.entries()) {
			if (stored.row.used_at || stored.row.expires_at <= nowIso) {
				this.codesByCodeId.delete(codeId);
				count += 1;
			}
		}
		return count;
	}
}

function buildHarness() {
	const client = {
		id: "client-row-1",
		clientId: "client-app-id",
		clientSecret: "plain-secret",
		environmentId: "env-1",
		createdBy: "user-1",
		expiresAt: null,
		name: "Integration Client",
	} satisfies Client;

	const envRepo = new InMemoryEnvironmentRepo(new Map([["env-1", { id: "env-1", name: "production" }]]));
	const clientRepo = new InMemoryClientRepo([client]);
	void clientRepo.setRedirectUris(client.id, ["https://client.example.com/callback"]);
	const grants = new Map<string, ClientScopeGrant[]>([
		[
			client.id,
			[
				{ clientScopeId: "client-scope-read", scopeId: "scope-read", scopeName: "read:users" },
				{ clientScopeId: "client-scope-write", scopeId: "scope-write", scopeName: "write:users" },
			],
		],
	]);
	const tokenRepo = new InMemoryTokenRepo(clientRepo, envRepo, grants);
	const refreshTokenRepo = new InMemoryRefreshTokenRepo();
	const authorizationCodeRepo = new InMemoryAuthorizationCodeRepo();
	const env = {} as CloudflareEnv;

	const tokenService = new OauthTokenService({
		clientRepo,
		authorizationCodeRepo,
		tokenRepo,
		refreshTokenRepo,
		envRepo,
		env,
	});

	const authorizationService = new OauthAuthorizationService({
		clientRepo,
		tokenRepo,
		authorizationCodeRepo,
	});

	return { client, tokenService, authorizationService };
}

async function toS256Challenge(value: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return Buffer.from(digest).toString("base64url");
}

describe("OAuth stateful flows", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-06T13:40:00.000Z"));
		vi.spyOn(console, "log").mockImplementation(() => {});
	});

	it("issues an access token and validates it as active", async () => {
		const { tokenService } = buildHarness();

		const issued = await tokenService.exchange({
			grantType: "client_credentials",
			clientId: "client-app-id",
			clientSecret: "plain-secret",
			scope: "read:users",
		});

		const validation = await tokenService.validateAccessToken(
			issued.access_token,
			["read:users"],
			"production"
		);

		expect(issued.access_token).toMatch(/^at_[0-9a-f]{64}$/);
		expect(validation).toMatchObject({
			valid: true,
			active: true,
			clientId: "client-app-id",
			environmentMatch: true,
			missingScopes: [],
			tokenScopes: ["read:users"],
		});
	});

	it("issues an access token, revokes it, and then validates it as inactive", async () => {
		const { tokenService } = buildHarness();

		const issued = await tokenService.exchange({
			grantType: "client_credentials",
			clientId: "client-app-id",
			clientSecret: "plain-secret",
			scope: "read:users",
		});

		const revoked = await tokenService.revokeTokenByValue(issued.access_token);
		const validation = await tokenService.validateAccessToken(issued.access_token, ["read:users"], "production");

		expect(revoked).toEqual({ revoked: true, tokenType: "access" });
		expect(validation).toMatchObject({
			valid: false,
			active: false,
			clientId: "client-app-id",
		});
	});

	it("issues an access token and then validates it as expired after time advances", async () => {
		const { tokenService } = buildHarness();

		const issued = await tokenService.exchange({
			grantType: "client_credentials",
			clientId: "client-app-id",
			clientSecret: "plain-secret",
			scope: "read:users",
		});

		vi.setSystemTime(new Date("2026-04-06T14:40:01.000Z"));

		const validation = await tokenService.validateAccessToken(issued.access_token, ["read:users"], "production");

		expect(validation).toMatchObject({
			valid: false,
			active: false,
			clientId: "client-app-id",
			expiresAt: "2026-04-06T14:40:00.000Z",
		});
	});

	it("exchanges an authorization code and rotates the refresh token across two steps", async () => {
		const { authorizationService, tokenService } = buildHarness();
		const codeVerifier = "verifier-123";

		const authorization = await authorizationService.authorize({
			responseType: "code",
			clientId: "client-app-id",
			redirectUri: "https://client.example.com/callback",
			scope: "read:users write:users",
			state: "state-123",
			codeChallenge: await toS256Challenge(codeVerifier),
			codeChallengeMethod: "S256",
			subject: "user-123",
		});

		const authorizationCode = new URL(authorization.redirectTo).searchParams.get("code");
		if (!authorizationCode) {
			throw new Error("Expected authorization code in redirect URL");
		}

		const firstPair = await tokenService.exchange({
			grantType: "authorization_code",
			clientId: "client-app-id",
			clientSecret: "plain-secret",
			code: authorizationCode,
			redirectUri: "https://client.example.com/callback",
			codeVerifier,
		});

		const secondPair = await tokenService.exchange({
			grantType: "refresh_token",
			clientId: "client-app-id",
			clientSecret: "plain-secret",
			refreshToken: firstPair.refresh_token,
		});

		await expect(
			tokenService.exchange({
				grantType: "refresh_token",
				clientId: "client-app-id",
				clientSecret: "plain-secret",
				refreshToken: firstPair.refresh_token,
			})
		).rejects.toEqual(new OAuthServiceError("invalid_grant", "Refresh token has been revoked.", 400));

		const validation = await tokenService.validateAccessToken(secondPair.access_token, ["read:users"], "production");

		expect(firstPair.refresh_token).toMatch(/^rt_[0-9a-f]{64}$/);
		expect(secondPair.refresh_token).toMatch(/^rt_[0-9a-f]{64}$/);
		expect(secondPair.refresh_token).not.toBe(firstPair.refresh_token);
		expect(secondPair.access_token).not.toBe(firstPair.access_token);
		expect(validation).toMatchObject({
			valid: true,
			active: true,
			tokenScopes: ["read:users", "write:users"],
		});
	});
});