import { generateApiKey, parseApiKey } from "@/lib/auth/api-key-format";
import { hashPasswordArgon2ViaService, verifyArgon2ViaService } from "@/lib/auth/password-hash";
import type { ApiKey, ApiKeyRepository } from "@/lib/repositories/api-key.repository";
import type { Client, ClientRepository } from "@/lib/repositories/client.repository";
import type { UserRecord, UserRepository } from "@/lib/repositories/admin.repository";
import type { ClientScopeGrant, TokenRepository } from "@/lib/repositories/token.repository";
import type { AdminAuditLogService } from "./admin-audit-log.service";
import { AUDIT_ACTION, AUDIT_RESOURCE } from "./audit-actions";
import { OAuthServiceError } from "./oauth.types";

export interface CreateApiKeyParams {
	/** clients.id (the internal row id). */
	clientRowId: string;
	userId: string;
	name?: string | null;
	/** ISO timestamp, or null for a key that never expires. */
	expiresAt?: string | null;
	/** Subset of the client's granted scopes. Empty/omitted = all of them at issue time. */
	scopeNames?: string[];
}

export interface CreateApiKeyResult {
	apiKey: ApiKey;
	/** The full `eak_..._...` credential. Returned once, never stored, never logged. */
	presentedKey: string;
}

/** Everything the token exchange needs, resolved from a verified credential. */
export interface AuthenticatedApiKey {
	apiKey: ApiKey;
	client: Client;
	user: UserRecord;
	scopeGrants: ClientScopeGrant[];
}

export interface ApiKeyServiceDeps {
	apiKeyRepo: ApiKeyRepository;
	clientRepo: ClientRepository;
	userRepo: UserRepository;
	tokenRepo: TokenRepository;
	adminAuditLogService: AdminAuditLogService;
	argonHasher?: Fetcher;
}

/**
 * Every authentication failure raises this one error. The endpoint is unauthenticated and
 * an attacker controls the whole input, so distinguishing "no such key" from "wrong
 * secret" from "revoked" would turn it into an oracle for enumerating valid key ids.
 * Operators get the real reason from the token activity log instead.
 */
function invalidApiKey(): OAuthServiceError {
	return new OAuthServiceError("invalid_client", "Invalid API key.", 401);
}

export class ApiKeyService {
	private readonly apiKeyRepo: ApiKeyRepository;
	private readonly clientRepo: ClientRepository;
	private readonly userRepo: UserRepository;
	private readonly tokenRepo: TokenRepository;
	private readonly adminAuditLogService: AdminAuditLogService;
	private readonly argonHasher?: Fetcher;

	constructor(deps: ApiKeyServiceDeps) {
		this.apiKeyRepo = deps.apiKeyRepo;
		this.clientRepo = deps.clientRepo;
		this.userRepo = deps.userRepo;
		this.tokenRepo = deps.tokenRepo;
		this.adminAuditLogService = deps.adminAuditLogService;
		this.argonHasher = deps.argonHasher;
	}

	private requireHasher(): Fetcher {
		// Fail closed: without the binding we can neither hash nor verify, and silently
		// falling back to a weaker digest for a long-lived credential would be worse than
		// refusing the operation.
		if (!this.argonHasher) {
			throw new Error("API keys require the ARGON_HASHER binding");
		}
		return this.argonHasher;
	}

	async list(clientRowId: string): Promise<ApiKey[]> {
		return this.apiKeyRepo.listByClient(clientRowId);
	}

	/**
	 * Resolve the requested scope names against the client's current grants. An empty
	 * request means "everything the client is granted today", matching how the
	 * client_credentials grant treats an absent `scope` parameter.
	 *
	 * The result is always materialized into api_key_scopes, so a key is a SNAPSHOT: it
	 * does not pick up scopes granted to the client after the key was issued. That is the
	 * least-surprising reading of a long-lived machine credential, and it is what lets
	 * authenticate() treat an empty subset as "mints nothing" instead of "mints everything".
	 */
	private async resolveScopeGrants(
		clientRowId: string,
		scopeNames: string[] | undefined
	): Promise<ClientScopeGrant[]> {
		const allGrants = await this.tokenRepo.getClientScopeGrants(clientRowId);
		const requested = (scopeNames ?? []).map((s) => s.trim()).filter((s) => s.length > 0);
		if (requested.length === 0) {
			return allGrants;
		}
		const byName = new Map(allGrants.map((grant) => [grant.scopeName, grant]));
		const selected: ClientScopeGrant[] = [];
		for (const scopeName of requested) {
			const grant = byName.get(scopeName);
			if (!grant) {
				throw new Error(`Scope not granted to this client: ${scopeName}`);
			}
			selected.push(grant);
		}
		return selected;
	}

	async create(
		params: CreateApiKeyParams,
		actorUserId: string | null
	): Promise<CreateApiKeyResult> {
		const hasher = this.requireHasher();

		const client = await this.clientRepo.getById(params.clientRowId);
		if (!client) {
			throw new Error("Client not found");
		}
		const user = await this.userRepo.getById(params.userId);
		if (!user) {
			throw new Error("User not found");
		}
		// Mirrors the sign-in confinement: a test user may only ever authenticate against a
		// test client, and an API key is just another way for that user to get a token.
		if (user.isTestUser && !client.isTest) {
			throw new Error("A test user can only be bound to a test client");
		}
		if (params.expiresAt != null && Number.isNaN(Date.parse(params.expiresAt))) {
			throw new Error("expiresAt must be a valid ISO timestamp");
		}

		const grants = await this.resolveScopeGrants(params.clientRowId, params.scopeNames);
		const generated = generateApiKey();
		const keyHash = await hashPasswordArgon2ViaService(generated.secret, hasher);
		const id = crypto.randomUUID();

		await this.apiKeyRepo.create(
			{
				id,
				key_id: generated.keyId,
				key_hash: keyHash,
				client_id: params.clientRowId,
				user_id: params.userId,
				name: params.name?.trim() || null,
				created_by: actorUserId,
				created_at: new Date().toISOString(),
				expires_at: params.expiresAt ?? null,
			},
			grants.map((grant) => grant.clientScopeId)
		);

		// key_id is safe to record; the secret half never leaves this method.
		await this.adminAuditLogService.logAction({
			actorUserId,
			action: AUDIT_ACTION.apiKeyCreate,
			resourceType: AUDIT_RESOURCE.apiKey,
			resourceId: id,
			details: {
				keyId: generated.keyId,
				clientId: client.clientId,
				userId: params.userId,
				scopes: grants.map((grant) => grant.scopeName),
				expiresAt: params.expiresAt ?? null,
			},
		});

		const created = await this.apiKeyRepo.getById(id);
		if (!created) {
			throw new Error("Failed to load the created API key");
		}
		return { apiKey: created, presentedKey: generated.presented };
	}

	async revoke(id: string, actorUserId: string | null): Promise<ApiKey | null> {
		const existing = await this.apiKeyRepo.getById(id);
		if (!existing) {
			return null;
		}
		if (existing.revokedAt) {
			return existing;
		}
		await this.apiKeyRepo.revoke(id, new Date().toISOString());
		await this.adminAuditLogService.logAction({
			actorUserId,
			action: AUDIT_ACTION.apiKeyRevoke,
			resourceType: AUDIT_RESOURCE.apiKey,
			resourceId: id,
			details: { keyId: existing.keyId, clientId: existing.clientId },
		});
		return this.apiKeyRepo.getById(id);
	}

	/**
	 * Verify a presented credential and resolve everything the token exchange needs.
	 *
	 * Ordered cheapest-first so a malformed or unknown key costs no Argon2id work, but
	 * every failure raises the same error regardless of which check tripped.
	 */
	async authenticate(presentedKey: string): Promise<AuthenticatedApiKey> {
		const hasher = this.requireHasher();

		const parsed = parseApiKey(presentedKey);
		if (!parsed) {
			throw invalidApiKey();
		}
		const stored = await this.apiKeyRepo.getByKeyId(parsed.keyId);
		if (!stored) {
			throw invalidApiKey();
		}
		const nowIso = new Date().toISOString();
		if (stored.revokedAt) {
			throw invalidApiKey();
		}
		if (stored.expiresAt && stored.expiresAt <= nowIso) {
			throw invalidApiKey();
		}

		const ok = await verifyArgon2ViaService(parsed.secret, stored.keyHash, hasher);
		if (!ok) {
			throw invalidApiKey();
		}

		// The key row survives its client/user only via FK cascade, so these are defence in
		// depth rather than expected states -- but an expired client must stop minting.
		const client = await this.clientRepo.getById(stored.clientId);
		if (!client) {
			throw invalidApiKey();
		}
		if (client.expiresAt && client.expiresAt <= nowIso) {
			throw invalidApiKey();
		}
		const user = await this.userRepo.getById(stored.userId);
		if (!user) {
			throw invalidApiKey();
		}
		if (user.isTestUser && !client.isTest) {
			throw invalidApiKey();
		}

		// The subset is always materialized at creation (see create()), so there is no
		// "unset means everything" fallback to make here. An empty result means every scope
		// this key held has since been ungranted from the client and cascaded away -- the
		// key mints nothing rather than silently inheriting the client's current grants,
		// which would let a key narrowed to `read` come back minting whatever was added later.
		const scopeGrants = await this.apiKeyRepo.getScopeGrants(stored.id);

		const apiKey: ApiKey = {
			id: stored.id,
			keyId: stored.keyId,
			clientId: stored.clientId,
			userId: stored.userId,
			userDisplay: stored.userDisplay,
			name: stored.name,
			createdBy: stored.createdBy,
			createdAt: stored.createdAt,
			expiresAt: stored.expiresAt,
			revokedAt: stored.revokedAt,
			lastUsedAt: stored.lastUsedAt,
		};
		return { apiKey, client, user, scopeGrants };
	}

	/** Best-effort usage stamp; callers run this outside the response path. */
	async touchLastUsed(id: string): Promise<void> {
		await this.apiKeyRepo.touchLastUsed(id, new Date().toISOString());
	}
}
