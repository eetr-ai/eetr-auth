import { generateApiKey, parseApiKey } from "@/lib/auth/api-key-format";
import { hashPassword, verifyPassword } from "@/lib/auth/password-hash";
import { apiKeyCreatedBodyHtml, buildTransactionalEmailHtml } from "@/lib/email/transactional-html";
import type { HashMethod } from "@/lib/config/hash-method";
import type { ApiKey, ApiKeyRepository } from "@/lib/repositories/api-key.repository";
import type { Client, ClientRepository } from "@/lib/repositories/client.repository";
import type { UserRecord, UserRepository } from "@/lib/repositories/admin.repository";
import type { ClientScopeGrant, TokenRepository } from "@/lib/repositories/token.repository";
import type { SiteSettingsRepository } from "@/lib/repositories/site-settings.repository";
import type { AdminAuditLogService } from "./admin-audit-log.service";
import type { SiteSettingsService } from "./site-settings.service";
import type { TransactionalEmailService } from "./transactional-email.service";
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
	/**
	 * Email the bound user that this key was created. Set by the self-service route, where
	 * the user's own access token authorized the key and no administrator was involved --
	 * an unexpected message is how they learn their token has been taken.
	 *
	 * Not best-effort: a user with no email address is refused, and a send that fails
	 * rolls the key back (see create()).
	 */
	notifyUser?: boolean;
}

export interface CreateApiKeyResult {
	apiKey: ApiKey;
	/** The full `eak_..._...` credential. Returned once, never stored, never logged. */
	presentedKey: string;
}

/**
 * Who performed an admin action, when the caller is a machine.
 *
 * A client-credentials admin token has no subject, and `api_keys.created_by` is a FK to
 * users(id) -- so the acting client cannot be smuggled in there as a synthetic id. It is
 * carried separately and lands in the audit entry's free-form details.
 */
export interface ActorContext {
	viaAdminClientRowId?: string | null;
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
	/**
	 * The three below are needed only by `create({ notifyUser: true })`. Optional so the
	 * OAuth-only wiring and existing fixtures can omit them, matching how OauthTokenService
	 * treats its own apiKeyService dep; create() refuses to notify rather than proceeding
	 * silently when they are absent.
	 */
	siteRepo?: SiteSettingsRepository;
	siteSettings?: SiteSettingsService;
	mail?: TransactionalEmailService;
	argonHasher?: Fetcher;
	/**
	 * Same policy as user passwords (see resolveHashMethod): `argon` everywhere real, and
	 * `md5` only as the documented local-dev convenience that lets the stack run without
	 * the Rust argon-hasher Worker. Production refuses `md5` outright.
	 */
	hashMethod?: HashMethod;
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
	private readonly siteRepo?: SiteSettingsRepository;
	private readonly siteSettings?: SiteSettingsService;
	private readonly mail?: TransactionalEmailService;
	private readonly argonHasher?: Fetcher;
	private readonly hashMethod: HashMethod;

	constructor(deps: ApiKeyServiceDeps) {
		this.apiKeyRepo = deps.apiKeyRepo;
		this.clientRepo = deps.clientRepo;
		this.userRepo = deps.userRepo;
		this.tokenRepo = deps.tokenRepo;
		this.adminAuditLogService = deps.adminAuditLogService;
		this.siteRepo = deps.siteRepo;
		this.siteSettings = deps.siteSettings;
		this.mail = deps.mail;
		this.argonHasher = deps.argonHasher;
		// Default argon (fail closed), matching hashPassword/verifyPassword: a caller that
		// forgets to pass hashMethod gets the strong path, which then requires the binding.
		this.hashMethod = deps.hashMethod ?? "argon";
	}

	private hashOptions() {
		return { argonHasher: this.argonHasher, hashMethod: this.hashMethod };
	}

	/**
	 * List a client's keys, optionally confined to one bound user.
	 *
	 * The filter is applied here rather than in SQL because the self-service callers that
	 * need it are the only ones that do, and a client's key list is small and already
	 * fetched whole by {@link getByKeyIdForClient}.
	 */
	async list(clientRowId: string, opts?: { userId?: string | null }): Promise<ApiKey[]> {
		const keys = await this.apiKeyRepo.listByClient(clientRowId);
		if (!opts?.userId) {
			return keys;
		}
		return keys.filter((key) => key.userId === opts.userId);
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
		// Deduplicated: api_key_scopes is UNIQUE(api_key_id, client_scope_id), so a repeated
		// name would abort the insert *after* the key row is written.
		const requested = [
			...new Set((scopeNames ?? []).map((s) => s.trim()).filter((s) => s.length > 0)),
		];
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
		actorUserId: string | null,
		actor?: ActorContext
	): Promise<CreateApiKeyResult> {
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
		// Checked before anything is written, so a user who cannot be notified never gets a
		// key created and immediately rolled back.
		if (params.notifyUser && !user.email?.trim()) {
			throw new Error(
				"Your account has no email address; an API key cannot be created without one"
			);
		}
		// Normalized to canonical UTC. authenticate() compares expiry to an ISO string
		// lexicographically, so storing an offset form like 2026-08-29T01:00:00+10:00
		// verbatim would sort it as if it expired 10 hours later than it actually does.
		let expiresAt: string | null = null;
		if (params.expiresAt != null) {
			const parsedExpiry = Date.parse(params.expiresAt);
			if (Number.isNaN(parsedExpiry)) {
				throw new Error("expiresAt must be a valid ISO timestamp");
			}
			expiresAt = new Date(parsedExpiry).toISOString();
		}

		const grants = await this.resolveScopeGrants(params.clientRowId, params.scopeNames);
		const generated = generateApiKey();
		const keyHash = await hashPassword(generated.secret, this.hashOptions());
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
				expires_at: expiresAt,
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
				expiresAt,
				...(actor?.viaAdminClientRowId
					? { viaAdminClientRowId: actor.viaAdminClientRowId }
					: {}),
			},
		});

		const created = await this.apiKeyRepo.getById(id);
		if (!created) {
			throw new Error("Failed to load the created API key");
		}

		if (params.notifyUser) {
			try {
				await this.sendCreatedNotification(created, client, user.email!.trim(), grants);
			} catch (error) {
				// The notification is the only thing standing between a stolen access token
				// and a silently issued long-lived credential, so a key that could not be
				// announced must not stay usable. Revoked rather than deleted, so the audit
				// trail still shows what happened.
				await this.apiKeyRepo.revoke(id, new Date().toISOString());
				const message = error instanceof Error ? error.message : String(error);
				throw new Error(`API key notification could not be sent, so the key was revoked: ${message}`);
			}
		}

		return { apiKey: created, presentedKey: generated.presented };
	}

	/**
	 * Tell the bound user that a key was issued in their name. Never includes the secret:
	 * it is shown once to the caller and is not recoverable, so there is nothing here worth
	 * stealing from an inbox.
	 */
	private async sendCreatedNotification(
		apiKey: ApiKey,
		client: Client,
		toEmail: string,
		grants: ClientScopeGrant[]
	): Promise<void> {
		if (!this.mail || !this.siteRepo || !this.siteSettings) {
			throw new Error("Email delivery is not configured");
		}
		const site = await this.siteRepo.get();
		const siteUrl = site?.siteUrl?.trim();
		if (!siteUrl) {
			throw new Error("Site URL is not configured");
		}
		const siteUrlHttp = siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`;
		const displayTitle = site?.siteTitle?.trim() || "API key created";
		const logoAlt = this.siteSettings.getDisplaySiteTitle(site?.siteTitle);
		const html = buildTransactionalEmailHtml({
			heading: displayTitle,
			logoUrl: this.siteSettings.getEmailLogoAbsoluteUrl(
				site?.logoKey ?? null,
				site?.cdnUrl ?? null
			),
			logoAlt,
			bodyHtml: apiKeyCreatedBodyHtml({
				clientName: client.name?.trim() || client.clientId,
				keyId: apiKey.keyId,
				name: apiKey.name,
				scopes: grants.map((grant) => grant.scopeName),
				expiresAt: apiKey.expiresAt,
			}),
			footerLine: `Sent by ${logoAlt}. If you did not create this API key, revoke it and treat your access token as compromised.`,
		});

		await this.mail.send({
			from: this.mail.fromAddress(siteUrlHttp),
			to: toEmail,
			subject: `New API key created — ${displayTitle}`,
			html,
			text: [
				`A new API key was created for your account using an access token issued to you.`,
				`Application: ${client.name?.trim() || client.clientId}`,
				`Key ID: ${apiKey.keyId}`,
				`Scopes: ${grants.map((g) => g.scopeName).join(", ") || "none"}`,
				`Expires: ${apiKey.expiresAt ?? "never"}`,
				`If you did not create it, revoke it and treat your access token as compromised.`,
			].join("\n"),
		});
	}

	/**
	 * Find a key by its public handle *within a client*. Scoping the lookup to the client
	 * means an admin caller addressing `/clients/{a}/api-keys/{keyId}` can never reach a key
	 * belonging to client `b`, even though key ids are globally unique.
	 */
	async getByKeyIdForClient(clientRowId: string, keyId: string): Promise<ApiKey | null> {
		const keys = await this.apiKeyRepo.listByClient(clientRowId);
		return keys.find((key) => key.keyId === keyId) ?? null;
	}

	/**
	 * The same lookup, additionally confined to one bound user.
	 *
	 * Self-service callers use this so a user managing their own keys cannot reach a
	 * colleague's key on the same client. It returns null rather than throwing, so the
	 * route answers 404 either way and never reveals that the handle exists.
	 */
	async getByKeyIdForClientAndUser(
		clientRowId: string,
		keyId: string,
		userId: string
	): Promise<ApiKey | null> {
		const key = await this.getByKeyIdForClient(clientRowId, keyId);
		return key && key.userId === userId ? key : null;
	}

	async revoke(
		id: string,
		actorUserId: string | null,
		actor?: ActorContext
	): Promise<ApiKey | null> {
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
			details: {
				keyId: existing.keyId,
				clientId: existing.clientId,
				...(actor?.viaAdminClientRowId
					? { viaAdminClientRowId: actor.viaAdminClientRowId }
					: {}),
			},
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

		const verification = await verifyPassword(parsed.secret, stored.keyHash, this.hashOptions());
		if (!verification.ok) {
			throw invalidApiKey();
		}
		if (verification.rehash) {
			// Row was stored under a weaker HASH_METHOD; upgrade it now that we hold the
			// plaintext, exactly as authenticateClient does for legacy client secrets.
			await this.apiKeyRepo.updateHash(stored.id, verification.rehash);
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
		// Re-check environment access on every exchange, for the same reason the refresh
		// grant does (see OauthTokenService.exchangeRefreshToken): the minted token names
		// this user as its subject, and an API key is longer-lived than the 30-day refresh
		// token that already gets this treatment. Without it, revoking a user's access to
		// the client's environment would leave their key minting tokens indefinitely.
		const userEnvironmentIds = await this.userRepo.getUserEnvironments(user.id);
		if (!userEnvironmentIds.includes(client.environmentId)) {
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
