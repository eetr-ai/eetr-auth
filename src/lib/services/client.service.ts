import { getDb } from "@/lib/db";
import type { RequestContext } from "@/lib/context/types";
import { ClientRepositoryD1 } from "@/lib/repositories/client.repository.d1";
import type {
	Client,
	ClientWithDetails,
} from "@/lib/repositories/client.repository";

function generateClientId(): string {
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
	let s = "progression_";
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
	createdBy: string;
	redirectUris?: string[];
	scopeIds?: string[];
	expiresAt?: string | null;
	name?: string | null;
}

export interface CreateClientResult {
	client: ClientWithDetails;
	clientSecret: string;
}

export class ClientService {
	private readonly clientRepo: ClientRepositoryD1;

	constructor(ctx: RequestContext) {
		const db = getDb(ctx.env);
		this.clientRepo = new ClientRepositoryD1(db);
	}

	async list(environmentId?: string): Promise<Client[]> {
		return this.clientRepo.list(environmentId);
	}

	async getById(id: string): Promise<Client | null> {
		return this.clientRepo.getById(id);
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
		const id = crypto.randomUUID();
		const clientId = generateClientId();
		const clientSecret = generateClientSecret();
		await this.clientRepo.create({
			id,
			client_id: clientId,
			client_secret: clientSecret,
			environment_id: params.environmentId,
			created_by: params.createdBy,
			expires_at: params.expiresAt ?? null,
			name: params.name ?? null,
		});
		const uris = (params.redirectUris ?? []).filter((u) => u?.trim());
		const scopeIds = (params.scopeIds ?? []).filter(Boolean);
		if (uris.length > 0) await this.clientRepo.setRedirectUris(id, uris);
		if (scopeIds.length > 0) await this.clientRepo.setClientScopes(id, scopeIds);
		const details = await this.getClientWithDetails(id);
		return {
			client: details!,
			clientSecret,
		};
	}

	async updateRedirectUris(id: string, uris: string[]): Promise<ClientWithDetails | null> {
		const client = await this.clientRepo.getById(id);
		if (!client) return null;
		await this.clientRepo.setRedirectUris(id, uris.filter((u) => u?.trim()));
		return this.getClientWithDetails(id);
	}

	async updateScopes(id: string, scopeIds: string[]): Promise<ClientWithDetails | null> {
		const client = await this.clientRepo.getById(id);
		if (!client) return null;
		await this.clientRepo.setClientScopes(id, scopeIds.filter(Boolean));
		return this.getClientWithDetails(id);
	}

	async updateName(id: string, name: string | null): Promise<ClientWithDetails | null> {
		const client = await this.clientRepo.getById(id);
		if (!client) return null;
		await this.clientRepo.updateName(id, name);
		return this.getClientWithDetails(id);
	}

	async delete(id: string): Promise<boolean> {
		const client = await this.clientRepo.getById(id);
		if (!client) return false;
		await this.clientRepo.delete(id);
		return true;
	}

	async rotateSecret(id: string): Promise<{ client: Client; clientSecret: string } | null> {
		const client = await this.clientRepo.getById(id);
		if (!client) return null;
		const newSecret = generateClientSecret();
		await this.clientRepo.updateSecret(id, newSecret);
		const updated = await this.clientRepo.getById(id);
		return updated ? { client: updated, clientSecret: newSecret } : null;
	}
}
