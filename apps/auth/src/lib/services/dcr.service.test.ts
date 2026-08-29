import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ClientService, CreateClientParams, CreateClientResult } from "./client.service";
import type { EnvironmentRepository } from "@/lib/repositories/environment.repository";
import type { ScopeRepository } from "@/lib/repositories/scope.repository";
import { DcrService, type DcrConfig, type DcrRegistrationRequest } from "./dcr.service";

function createClientServiceMock(): { create: ReturnType<typeof vi.fn> } & ClientService {
	const create = vi.fn(async (params: CreateClientParams): Promise<CreateClientResult> => ({
		client: {
			id: "row-1",
			clientId: "mcp_generatedclientid",
			clientSecret: "",
			environmentId: params.environmentId,
			createdBy: "(deleted user)",
			expiresAt: null,
			name: params.name ?? null,
			tokenEndpointAuthMethod: params.tokenEndpointAuthMethod ?? "client_secret_basic",
			isDynamic: params.isDynamic ?? false,
			redirectUris: params.redirectUris ?? [],
			scopeIds: params.scopeIds ?? [],
			claims: [],
		},
		clientSecret: params.tokenEndpointAuthMethod === "none" ? "" : "generated-secret",
	}));
	return { create } as unknown as { create: ReturnType<typeof vi.fn> } & ClientService;
}

function createEnvRepoMock(exists = true): EnvironmentRepository {
	return {
		list: vi.fn(),
		getById: vi.fn().mockResolvedValue(exists ? { id: "env-mcp", name: "mcp" } : null),
		create: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
		countClientsByEnvironment: vi.fn(),
	};
}

function createScopeRepoMock(): ScopeRepository {
	return {
		list: vi.fn().mockResolvedValue([
			{ id: "scope-openid", scopeName: "openid", displayName: null, description: null },
			{ id: "scope-profile", scopeName: "profile", displayName: null, description: null },
			{ id: "scope-email", scopeName: "email", displayName: null, description: null },
		]),
		getById: vi.fn(),
		listByNames: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
		countClientScopes: vi.fn(),
	};
}

function makeRequest(overrides?: Partial<DcrRegistrationRequest>): DcrRegistrationRequest {
	return {
		redirectUris: ["https://claude.ai/callback"],
		tokenEndpointAuthMethod: "none",
		grantTypes: ["authorization_code", "refresh_token"],
		responseTypes: ["code"],
		clientName: "Test MCP",
		scopeNames: [],
		...overrides,
	};
}

function createService(overrides?: {
	clientService?: ClientService;
	envRepo?: EnvironmentRepository;
	scopeRepo?: ScopeRepository;
	config?: Partial<DcrConfig>;
}) {
	const clientService = overrides?.clientService ?? createClientServiceMock();
	const service = new DcrService({
		clientService,
		envRepo: overrides?.envRepo ?? createEnvRepoMock(),
		scopeRepo: overrides?.scopeRepo ?? createScopeRepoMock(),
		config: {
			enabled: true,
			environmentId: "env-mcp",
			...overrides?.config,
		},
	});
	return { service, clientService };
}

describe("DcrService.register", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("creates a public (PKCE-only) client, resolves scopes, and omits client_secret", async () => {
		const { service, clientService } = createService();

		const result = await service.register(
			makeRequest({ scopeNames: ["openid", "profile"] })
		);

		expect(clientService.create).toHaveBeenCalledWith(
			expect.objectContaining({
				environmentId: "env-mcp",
				createdBy: null,
				tokenEndpointAuthMethod: "none",
				isDynamic: true,
				redirectUris: ["https://claude.ai/callback"],
				scopeIds: ["scope-openid", "scope-profile"],
				name: "Test MCP",
			})
		);
		expect(result.client_id).toBe("mcp_generatedclientid");
		expect(result.token_endpoint_auth_method).toBe("none");
		expect(result.grant_types).toEqual(["authorization_code", "refresh_token"]);
		expect(result.response_types).toEqual(["code"]);
		expect(result.scope).toBe("openid profile");
		expect(result.client_secret).toBeUndefined();
		expect(typeof result.client_id_issued_at).toBe("number");
	});

	it("returns a client_secret for a confidential registration", async () => {
		const { service } = createService();

		const result = await service.register(
			makeRequest({ tokenEndpointAuthMethod: "client_secret_basic" })
		);

		expect(result.token_endpoint_auth_method).toBe("client_secret_basic");
		expect(result.client_secret).toBe("generated-secret");
		expect(result.client_secret_expires_at).toBe(0);
	});

	it("rejects when DCR is not configured (no environment)", async () => {
		const { service } = createService({ config: { environmentId: null } });
		await expect(service.register(makeRequest())).rejects.toMatchObject({ code: "access_denied", status: 403 });
	});

	it("rejects when DCR is explicitly disabled", async () => {
		const { service } = createService({ config: { enabled: false } });
		await expect(service.register(makeRequest())).rejects.toMatchObject({ code: "access_denied", status: 403 });
	});

	it("rejects unknown scopes", async () => {
		const { service } = createService();
		await expect(
			service.register(makeRequest({ scopeNames: ["openid", "admin:everything"] }))
		).rejects.toMatchObject({ code: "invalid_client_metadata" });
	});

	it("rejects when the configured environment does not exist", async () => {
		const { service } = createService({ envRepo: createEnvRepoMock(false) });
		await expect(service.register(makeRequest())).rejects.toMatchObject({ code: "access_denied" });
	});
});
