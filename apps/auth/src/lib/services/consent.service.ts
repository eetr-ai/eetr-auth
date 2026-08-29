import type {
	ConsentRepository,
	ConsentWithClient,
} from "@/lib/repositories/consent.repository";
import type { RefreshTokenRepository } from "@/lib/repositories/refresh-token.repository";
import type { TokenRepository } from "@/lib/repositories/token.repository";
import type { AuthorizationCodeRepository } from "@/lib/repositories/authorization-code.repository";
import type { AdminAuditLogService } from "./admin-audit-log.service";
import { AUDIT_ACTION, AUDIT_RESOURCE } from "./audit-actions";

export interface ConsentServiceDependencies {
	consentRepo: ConsentRepository;
	refreshTokenRepo: RefreshTokenRepository;
	tokenRepo: TokenRepository;
	authorizationCodeRepo: AuthorizationCodeRepository;
	adminAuditLogService: AdminAuditLogService;
}

export interface RevokeConsentResult {
	ok: boolean;
	/** How many refresh tokens' access tokens were force-expired. */
	accessTokensExpired: number;
	/** How many unused authorization codes were dropped. */
	codesDeleted: number;
}

/**
 * Records what a user has authorized a client to do, so the consent screen can be skipped
 * when nothing new is being asked for, and so an admin can audit and withdraw it.
 *
 * Consent accumulates: a request for a scope the user has not seen before adds to the set
 * rather than replacing it, matching how every mainstream provider behaves. Withdrawing is
 * all-or-nothing per client.
 */
export class ConsentService {
	private readonly consentRepo: ConsentRepository;
	private readonly refreshTokenRepo: RefreshTokenRepository;
	private readonly tokenRepo: TokenRepository;
	private readonly authorizationCodeRepo: AuthorizationCodeRepository;
	private readonly adminAuditLogService: AdminAuditLogService;

	constructor({
		consentRepo,
		refreshTokenRepo,
		tokenRepo,
		authorizationCodeRepo,
		adminAuditLogService,
	}: ConsentServiceDependencies) {
		this.consentRepo = consentRepo;
		this.refreshTokenRepo = refreshTokenRepo;
		this.tokenRepo = tokenRepo;
		this.authorizationCodeRepo = authorizationCodeRepo;
		this.adminAuditLogService = adminAuditLogService;
	}

	/** The scope names a user has already consented to for a client. */
	async getConsentedScopeNames(userId: string, clientRowId: string): Promise<string[]> {
		const record = await this.consentRepo.get(userId, clientRowId);
		return record?.scopeNames ?? [];
	}

	/**
	 * Which of `scopeNames` the user has NOT yet consented to. An empty result means the
	 * request is fully covered and the consent screen can be skipped; a non-empty result is
	 * exactly what the screen should ask about.
	 */
	async getUnconsentedScopeNames(
		userId: string,
		clientRowId: string,
		scopeNames: string[]
	): Promise<string[]> {
		const consented = new Set(await this.getConsentedScopeNames(userId, clientRowId));
		return scopeNames.filter((name) => !consented.has(name));
	}

	/**
	 * Record consent, merging into whatever the user had already agreed to.
	 *
	 * A request that grants nothing new still rewrites the row, which refreshes
	 * `updated_at` -- that is deliberate, so the admin surface can show when a consent was
	 * last exercised rather than only when it was first given.
	 */
	async record(userId: string, clientRowId: string, scopeNames: string[]): Promise<void> {
		const existing = await this.consentRepo.get(userId, clientRowId);
		// Sorted so the stored string is stable regardless of the order scopes were
		// requested in, which keeps it diffable in the audit log and in tests.
		const merged = Array.from(new Set([...(existing?.scopeNames ?? []), ...scopeNames])).sort();
		await this.consentRepo.upsert({
			id: existing?.id ?? crypto.randomUUID(),
			userId,
			clientId: clientRowId,
			scopeNames: merged,
			now: new Date().toISOString(),
		});
	}

	async listForUser(userId: string): Promise<ConsentWithClient[]> {
		return this.consentRepo.listByUser(userId);
	}

	/**
	 * Withdraw consent and make it stick: drop the record, revoke the user's refresh tokens
	 * for that client, force-expire the access tokens bound to them, and delete any unused
	 * authorization code. Without the last three, "revoked" consent would leave working
	 * credentials behind for the life of the token.
	 */
	async revoke(
		userId: string,
		clientRowId: string,
		actorUserId: string | null = null
	): Promise<RevokeConsentResult> {
		const existing = await this.consentRepo.get(userId, clientRowId);
		const deleted = await this.consentRepo.delete(userId, clientRowId);

		const nowIso = new Date().toISOString();
		const accessTokenIds = await this.refreshTokenRepo.revokeAllForSubjectAndClient(
			userId,
			clientRowId,
			nowIso
		);
		const accessTokensExpired =
			accessTokenIds.length > 0
				? await this.tokenRepo.expireAccessTokensByIds(accessTokenIds, nowIso)
				: 0;
		const codesDeleted = await this.authorizationCodeRepo.deleteUnusedForSubjectAndClient(
			userId,
			clientRowId
		);

		// Audit even when there was no consent row: the token and code cleanup still ran,
		// and an admin pressing revoke is worth recording either way.
		await this.adminAuditLogService.logAction({
			actorUserId,
			action: AUDIT_ACTION.consentRevoke,
			resourceType: AUDIT_RESOURCE.consent,
			resourceId: clientRowId,
			details: {
				userId,
				scopeNames: existing?.scopeNames ?? [],
				hadConsentRecord: deleted,
				accessTokensExpired,
				codesDeleted,
			},
		});

		return { ok: true, accessTokensExpired, codesDeleted };
	}
}
