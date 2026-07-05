import { hashClientSecretForStorage, resolveHmacKey } from "@/lib/auth/secret-at-rest";
import { resolveClientKeyPrefix } from "@/lib/config/client-key-prefix";
import type {
	Client,
	ClientRepository,
	ClientWithDetails,
} from "@/lib/repositories/client.repository";
import type { AdminAuditLogService } from "./admin-audit-log.service";
import { AUDIT_ACTION, AUDIT_RESOURCE } from "./audit-actions";

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
	env: CloudflareEnv;
}

export class ClientService {
	private readonly clientRepo: ClientRepository;
	private readonly adminAuditLogService: AdminAuditLogService;
	private readonly env: Record<string, unknown>;

	constructor({ clientRepo, adminAuditLogService, env }: ClientServiceDeps) {
		this.clientRepo = clientRepo;
		this.adminAuditLogService = adminAuditLogService;
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
		const [redirectUris, scopes] = await Promise.all([
			this.clientRepo.getRedirectUris(id),
			this.clientRepo.getClientScopes(id),
		]);
		return {
			...client,
			redirectUris,
			scopeIds: scopes.map((s) => s.scopeId),
		};
	}

	async create(params: CreateClientParams): Promise<CreateClientResult> {
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
