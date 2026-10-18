import { hashClientSecretForStorage, resolveHmacKey } from "@/lib/auth/secret-at-rest";
import { resolveClientKeyPrefix } from "@/lib/config/client-key-prefix";
import type {
	Client,
	ClientHomeInput,
	ClientRepository,
	ClientWithDetails,
} from "@/lib/repositories/client.repository";
import type { AdminAuditLogService } from "./admin-audit-log.service";
import { AUDIT_ACTION, AUDIT_RESOURCE } from "./audit-actions";
import type { ClientClaimService } from "./client-claim.service";
import type { ClientClaimInput } from "@/lib/repositories/client-claim.repository";

function generateClientId(prefix: string): string {
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
	let s = `${prefix}_`;
	for (let i = 0; i < 24; i++) {
		s += chars[Math.floor(Math.random() * chars.length)];
	}
	return s;
}

function generateClientSecret(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const HOME_DISPLAY_NAME_MAX_LENGTH = 80;

/** One entry on the non-admin landing page. */
export interface ClientHomeLink {
	label: string;
	url: string;
}

export class ClientHomeValidationError extends Error {}

/**
 * Normalize an admin-entered home link. Blank fields become null, the URL must be
 * http(s) so the landing page never renders a `javascript:` href, and the checkbox
 * means nothing without a URL to link to.
 */
export function normalizeClientHome(input: Partial<ClientHomeInput>): ClientHomeInput {
	const homeUrl = input.homeUrl?.trim() || null;
	const homeDisplayName = input.homeDisplayName?.trim() || null;
	const showOnHome = Boolean(input.showOnHome);
	if (homeUrl) {
		let parsed: URL;
		try {
			parsed = new URL(homeUrl);
		} catch {
			throw new ClientHomeValidationError("The home URL is not a valid URL.");
		}
		if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
			throw new ClientHomeValidationError("The home URL must start with http:// or https://.");
		}
	}
	if (showOnHome && !homeUrl) {
		throw new ClientHomeValidationError("Set a home URL before showing the client on the home page.");
	}
	if (homeDisplayName && homeDisplayName.length > HOME_DISPLAY_NAME_MAX_LENGTH) {
		throw new ClientHomeValidationError(
			`The home display name can be at most ${HOME_DISPLAY_NAME_MAX_LENGTH} characters.`
		);
	}
	return { homeUrl, homeDisplayName, showOnHome };
}

export interface CreateClientParams {
	environmentId: string;
	// The creating admin's user id, or null for dynamically registered (RFC 7591) clients
	// which have no admin actor.
	createdBy: string | null;
	redirectUris?: string[];
	scopeIds?: string[];
	expiresAt?: string | null;
	name?: string | null;
	// RFC 7591 token_endpoint_auth_method. Defaults to 'client_secret_basic' (confidential,
	// a secret is generated). 'none' creates a public/PKCE-only client with no secret.
	tokenEndpointAuthMethod?: string;
	// Mark this client as dynamically registered (RFC 7591).
	isDynamic?: boolean;
	// Mark this client as a test client: its sign-in page lists only test users, and it is
	// the only kind of client a test user may authenticate against. Immutable afterwards --
	// there is deliberately no updateIsTest.
	isTest?: boolean;
	// Optional home link for the non-admin landing page; validated by normalizeClientHome.
	homeUrl?: string | null;
	homeDisplayName?: string | null;
	showOnHome?: boolean;
}

export interface CreateClientResult {
	client: ClientWithDetails;
	// The plaintext secret, returned once at creation for confidential clients. Empty
	// string for public (token_endpoint_auth_method='none') clients, which have no secret.
	clientSecret: string;
}

export interface ClientServiceDeps {
	clientRepo: ClientRepository;
	adminAuditLogService: AdminAuditLogService;
	clientClaimService: ClientClaimService;
	env: CloudflareEnv;
}

export class ClientService {
	private readonly clientRepo: ClientRepository;
	private readonly adminAuditLogService: AdminAuditLogService;
	private readonly env: Record<string, unknown>;

	private readonly clientClaimService: ClientClaimService;

	constructor({ clientRepo, adminAuditLogService, clientClaimService, env }: ClientServiceDeps) {
		this.clientRepo = clientRepo;
		this.adminAuditLogService = adminAuditLogService;
		this.clientClaimService = clientClaimService;
		this.env = env as unknown as Record<string, unknown>;
	}

	async list(environmentId?: string): Promise<Client[]> {
		return this.clientRepo.list(environmentId);
	}

	async getById(id: string): Promise<Client | null> {
		return this.clientRepo.getById(id);
	}

	async getByClientIdentifier(clientId: string): Promise<Client | null> {
		return this.clientRepo.getByClientIdentifier(clientId);
	}

	async getClientWithDetails(id: string): Promise<ClientWithDetails | null> {
		const client = await this.clientRepo.getById(id);
		if (!client) return null;
		const [redirectUris, scopes, claims] = await Promise.all([
			this.clientRepo.getRedirectUris(id),
			this.clientRepo.getClientScopes(id),
			this.clientClaimService.listByClient(id),
		]);
		return {
			...client,
			redirectUris,
			scopeIds: scopes.map((s) => s.scopeId),
			claims,
		};
	}

	/**
	 * Replace the client's custom JWT claims. Validation (reserved names, value types)
	 * lives in ClientClaimService, which throws on bad input rather than dropping it.
	 */
	async updateClaims(
		id: string,
		claims: ClientClaimInput[],
		actorUserId: string | null = null
	): Promise<boolean> {
		const client = await this.clientRepo.getById(id);
		if (!client) return false;
		await this.clientClaimService.setClientClaims(id, claims);
		await this.adminAuditLogService.logAction({
			actorUserId,
			action: AUDIT_ACTION.clientUpdate,
			resourceType: AUDIT_RESOURCE.client,
			resourceId: id,
			details: { claims: claims.map((claim) => claim.claimName).sort() },
		});
		return true;
	}

	async create(params: CreateClientParams): Promise<CreateClientResult> {
		// A DCR (RFC 7591) client is registered by an unauthenticated caller, so it must never
		// be a test client -- that would let anyone mint a client whose sign-in page hands out
		// sessions with one click. The DB CHECK backstops this; the throw is here because
		// CreateClientParams is a wide object literal and DcrService spreads a caller-derived
		// object into it, so a future refactor could otherwise smuggle the flag through.
		if (params.isTest && params.isDynamic) {
			throw new Error("A dynamically registered client cannot be a test client.");
		}
		const home = normalizeClientHome(params);
		const tokenEndpointAuthMethod = params.tokenEndpointAuthMethod ?? "client_secret_basic";
		const isPublic = tokenEndpointAuthMethod === "none";
		const id = crypto.randomUUID();
		const clientId = generateClientId(resolveClientKeyPrefix(this.env));
		// Public (PKCE-only) clients have no secret: store the empty sentinel and return "".
		// Confidential clients generate a secret hashed at rest with the HMAC key.
		let clientSecret = "";
		let clientSecretStored = "";
		if (!isPublic) {
			const hmacKey = resolveHmacKey(this.env);
			if (!hmacKey) {
				throw new Error("HMAC_KEY is required to create OAuth clients (set in Wrangler secrets or .dev.vars).");
			}
			clientSecret = generateClientSecret();
			clientSecretStored = await hashClientSecretForStorage(clientSecret, hmacKey);
		}
		await this.clientRepo.create({
			id,
			client_id: clientId,
			client_secret: clientSecretStored,
			environment_id: params.environmentId,
			created_by: params.createdBy,
			expires_at: params.expiresAt ?? null,
			name: params.name ?? null,
			token_endpoint_auth_method: tokenEndpointAuthMethod,
			is_dynamic: params.isDynamic ? 1 : 0,
			is_test: params.isTest ? 1 : 0,
			home_url: home.homeUrl,
			home_display_name: home.homeDisplayName,
			show_on_home: home.showOnHome ? 1 : 0,
		});
		const uris = (params.redirectUris ?? []).filter((u) => u?.trim());
		const scopeIds = (params.scopeIds ?? []).filter(Boolean);
		if (uris.length > 0) await this.clientRepo.setRedirectUris(id, uris);
		if (scopeIds.length > 0) await this.clientRepo.setClientScopes(id, scopeIds);
		const details = await this.getClientWithDetails(id);
		// Actor is the creating admin, or null for dynamic (RFC 7591) registration. Never log the secret.
		await this.adminAuditLogService.logAction({
			actorUserId: params.createdBy,
			action: AUDIT_ACTION.clientCreate,
			resourceType: AUDIT_RESOURCE.client,
			resourceId: id,
			details: {
				clientId,
				name: params.name ?? null,
				environmentId: params.environmentId,
				redirectUris: uris,
				scopeIds,
				tokenEndpointAuthMethod,
				isDynamic: params.isDynamic ?? false,
				isTest: params.isTest ?? false,
				...home,
			},
		});
		return {
			client: details!,
			clientSecret,
		};
	}

	async updateRedirectUris(
		id: string,
		uris: string[],
		actorUserId: string | null = null
	): Promise<ClientWithDetails | null> {
		const client = await this.clientRepo.getById(id);
		if (!client) return null;
		const nextUris = uris.filter((u) => u?.trim());
		await this.clientRepo.setRedirectUris(id, nextUris);
		await this.adminAuditLogService.logAction({
			actorUserId,
			action: AUDIT_ACTION.clientUpdate,
			resourceType: AUDIT_RESOURCE.client,
			resourceId: id,
			details: { clientId: client.clientId, field: "redirectUris", redirectUris: nextUris },
		});
		return this.getClientWithDetails(id);
	}

	async updateScopes(
		id: string,
		scopeIds: string[],
		actorUserId: string | null = null
	): Promise<ClientWithDetails | null> {
		const client = await this.clientRepo.getById(id);
		if (!client) return null;
		const nextScopeIds = scopeIds.filter(Boolean);
		await this.clientRepo.setClientScopes(id, nextScopeIds);
		await this.adminAuditLogService.logAction({
			actorUserId,
			action: AUDIT_ACTION.clientUpdate,
			resourceType: AUDIT_RESOURCE.client,
			resourceId: id,
			details: { clientId: client.clientId, field: "scopeIds", scopeIds: nextScopeIds },
		});
		return this.getClientWithDetails(id);
	}

	async updateName(
		id: string,
		name: string | null,
		actorUserId: string | null = null
	): Promise<ClientWithDetails | null> {
		const client = await this.clientRepo.getById(id);
		if (!client) return null;
		await this.clientRepo.updateName(id, name);
		await this.adminAuditLogService.logAction({
			actorUserId,
			action: AUDIT_ACTION.clientUpdate,
			resourceType: AUDIT_RESOURCE.client,
			resourceId: id,
			details: { clientId: client.clientId, field: "name", from: client.name, to: name },
		});
		return this.getClientWithDetails(id);
	}

	async updateHome(
		id: string,
		input: Partial<ClientHomeInput>,
		actorUserId: string | null = null
	): Promise<ClientWithDetails | null> {
		const client = await this.clientRepo.getById(id);
		if (!client) return null;
		const home = normalizeClientHome(input);
		await this.clientRepo.updateHome(id, home);
		await this.adminAuditLogService.logAction({
			actorUserId,
			action: AUDIT_ACTION.clientUpdate,
			resourceType: AUDIT_RESOURCE.client,
			resourceId: id,
			details: {
				clientId: client.clientId,
				field: "home",
				from: {
					homeUrl: client.homeUrl,
					homeDisplayName: client.homeDisplayName,
					showOnHome: client.showOnHome,
				},
				to: home,
			},
		});
		return this.getClientWithDetails(id);
	}

	/** Links for the landing page a signed-in non-admin sees at "/". */
	async listHomeLinks(now: Date = new Date()): Promise<ClientHomeLink[]> {
		const clients = await this.clientRepo.listHomeLinks(now.toISOString());
		const ret: ClientHomeLink[] = [];
		for (const client of clients) {
			if (!client.homeUrl) continue;
			ret.push({
				label: client.homeDisplayName?.trim() || client.name?.trim() || client.clientId,
				url: client.homeUrl,
			});
		}
		return ret;
	}

	async delete(id: string, actorUserId: string | null = null): Promise<boolean> {
		const client = await this.clientRepo.getById(id);
		if (!client) return false;
		await this.clientRepo.delete(id);
		await this.adminAuditLogService.logAction({
			actorUserId,
			action: AUDIT_ACTION.clientDelete,
			resourceType: AUDIT_RESOURCE.client,
			resourceId: id,
			details: { clientId: client.clientId, name: client.name, environmentId: client.environmentId },
		});
		return true;
	}

	async rotateSecret(
		id: string,
		actorUserId: string | null = null
	): Promise<{ client: Client; clientSecret: string } | null> {
		const hmacKey = resolveHmacKey(this.env);
		if (!hmacKey) {
			throw new Error("HMAC_KEY is required to rotate OAuth client secrets (set in Wrangler secrets or .dev.vars).");
		}
		const client = await this.clientRepo.getById(id);
		if (!client) return null;
		const newSecret = generateClientSecret();
		const stored = await hashClientSecretForStorage(newSecret, hmacKey);
		await this.clientRepo.updateSecret(id, stored);
		const updated = await this.clientRepo.getById(id);
		if (!updated) return null;
		// Never log the secret — only that it was rotated.
		await this.adminAuditLogService.logAction({
			actorUserId,
			action: AUDIT_ACTION.clientSecretRotate,
			resourceType: AUDIT_RESOURCE.client,
			resourceId: id,
			details: { clientId: client.clientId },
		});
		return { client: updated, clientSecret: newSecret };
	}
}
