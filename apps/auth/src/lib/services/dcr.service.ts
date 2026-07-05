import type { EnvironmentRepository } from "@/lib/repositories/environment.repository";
import type { ScopeRepository } from "@/lib/repositories/scope.repository";
import type { ClientService } from "./client.service";

/**
 * Error shape for Dynamic Client Registration (RFC 7591 §3.2.2). `code` is the RFC error
 * (`invalid_redirect_uri`, `invalid_client_metadata`) or an operational code
 * (`too_many_requests`, `access_denied`); `status` is the HTTP status the route returns.
 * Thrown both by the request parser (transport validation) and this service (domain checks).
 */
export class DcrServiceError extends Error {
	constructor(
		readonly code: string,
		message: string,
		readonly status: number
	) {
		super(message);
		this.name = "DcrServiceError";
	}
}

export function isDcrServiceError(error: unknown): error is DcrServiceError {
	return error instanceof DcrServiceError;
}

export interface DcrConfig {
	/** Whether the registration endpoint is enabled. */
	enabled: boolean;
	/** Existing environment id that dynamically registered clients are placed in. */
	environmentId: string | null;
}

export interface DcrServiceDeps {
	clientService: ClientService;
	envRepo: EnvironmentRepository;
	scopeRepo: ScopeRepository;
	config: DcrConfig;
}

/**
 * A validated, typed RFC 7591 registration request. Produced by the route's request parser
 * (transport-level decoding + shape/enum/format validation); consumed by {@link DcrService}
 * which only performs domain work (scope resolution, environment check, client creation).
 */
export interface DcrRegistrationRequest {
	redirectUris: string[];
	tokenEndpointAuthMethod: string;
	grantTypes: string[];
	responseTypes: string[];
	clientName: string | null;
	/** Requested scope names (syntactically parsed); resolved to ids/validated here. */
	scopeNames: string[];
}

export interface DcrRegistrationResponse {
	client_id: string;
	client_id_issued_at: number;
	redirect_uris: string[];
	grant_types: string[];
	response_types: string[];
	token_endpoint_auth_method: string;
	scope?: string;
	client_secret?: string;
	client_secret_expires_at?: number;
}

export class DcrService {
	private readonly clientService: ClientService;
	private readonly envRepo: EnvironmentRepository;
	private readonly scopeRepo: ScopeRepository;
	private readonly config: DcrConfig;

	constructor({ clientService, envRepo, scopeRepo, config }: DcrServiceDeps) {
		this.clientService = clientService;
		this.envRepo = envRepo;
		this.scopeRepo = scopeRepo;
		this.config = config;
	}

	/**
	 * Register a client from an already-validated request. Domain-only: resolves requested
	 * scope names to ids (rejecting unknown ones), verifies the configured environment
	 * exists, creates the client, and shapes the RFC 7591 response. Transport concerns
	 * (JSON decoding, field validation, rate limiting) are handled before this by the route.
	 */
	async register(request: DcrRegistrationRequest): Promise<DcrRegistrationResponse> {
		if (!this.config.enabled || !this.config.environmentId) {
			throw new DcrServiceError("access_denied", "Dynamic client registration is not enabled.", 403);
		}
		const environmentId = this.config.environmentId;

		// Resolve requested scope names to ids, rejecting any this server doesn't define.
		let scopeIds: string[] = [];
		if (request.scopeNames.length > 0) {
			const allScopes = await this.scopeRepo.list();
			const byName = new Map(allScopes.map((s) => [s.scopeName, s.id]));
			const unknown = request.scopeNames.filter((name) => !byName.has(name));
			if (unknown.length > 0) {
				throw new DcrServiceError("invalid_client_metadata", `Unknown scope(s): ${unknown.join(", ")}.`, 400);
			}
			scopeIds = request.scopeNames.map((name) => byName.get(name)!);
		}

		// Guard against a misconfigured DCR_ENVIRONMENT_ID pointing at a missing environment.
		const environment = await this.envRepo.getById(environmentId);
		if (!environment) {
			throw new DcrServiceError("access_denied", "Dynamic client registration is not enabled.", 403);
		}

		const created = await this.clientService.create({
			environmentId,
			createdBy: null,
			redirectUris: request.redirectUris,
			scopeIds,
			name: request.clientName,
			tokenEndpointAuthMethod: request.tokenEndpointAuthMethod,
			isDynamic: true,
		});

		const isPublic = request.tokenEndpointAuthMethod === "none";
		const response: DcrRegistrationResponse = {
			client_id: created.client.clientId,
			client_id_issued_at: Math.floor(Date.now() / 1000),
			redirect_uris: created.client.redirectUris,
			grant_types: request.grantTypes,
			response_types: request.responseTypes,
			token_endpoint_auth_method: request.tokenEndpointAuthMethod,
		};
		if (request.scopeNames.length > 0) {
			response.scope = request.scopeNames.join(" ");
		}
		if (!isPublic) {
			response.client_secret = created.clientSecret;
			// 0 = the secret does not expire (RFC 7591 §3.2.1).
			response.client_secret_expires_at = 0;
		}
		return response;
	}
}
