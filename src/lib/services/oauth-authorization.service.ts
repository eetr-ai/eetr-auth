import type { ClientRepository } from "@/lib/repositories/client.repository";
import type { TokenRepository } from "@/lib/repositories/token.repository";
import type { AuthorizationCodeRepository } from "@/lib/repositories/authorization-code.repository";
import { OAuthServiceError } from "./oauth.types";

const AUTHORIZATION_CODE_TTL_SECONDS = 300;

function generateOpaqueSecret(prefix: string, byteLength = 32): string {
	const bytes = new Uint8Array(byteLength);
	crypto.getRandomValues(bytes);
	const value = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
	return `${prefix}_${value}`;
}

function parseScopeParam(scope?: string): string[] {
	if (!scope?.trim()) return [];
	return Array.from(new Set(scope.split(/\s+/).map((s) => s.trim()).filter(Boolean)));
}

export interface AuthorizeRequestParams {
	responseType: string | null;
	clientId: string | null;
	redirectUri: string | null;
	scope?: string | null;
	state?: string | null;
	codeChallenge: string | null;
	codeChallengeMethod: string | null;
	subject: string;
}

export interface OauthAuthorizationServiceDeps {
	clientRepo: ClientRepository;
	tokenRepo: TokenRepository;
	authorizationCodeRepo: AuthorizationCodeRepository;
}

export class OauthAuthorizationService {
	private readonly clientRepo: ClientRepository;
	private readonly tokenRepo: TokenRepository;
	private readonly authorizationCodeRepo: AuthorizationCodeRepository;

	constructor({
		clientRepo,
		tokenRepo,
		authorizationCodeRepo,
	}: OauthAuthorizationServiceDeps) {
		this.clientRepo = clientRepo;
		this.tokenRepo = tokenRepo;
		this.authorizationCodeRepo = authorizationCodeRepo;
	}

	async authorize(params: AuthorizeRequestParams): Promise<{ redirectTo: string }> {
		if (params.responseType !== "code") {
			throw new OAuthServiceError(
				"unsupported_response_type",
				"Only response_type=code is supported.",
				400
			);
		}
		if (!params.clientId) {
			throw new OAuthServiceError("invalid_request", "Missing client_id.", 400);
		}
		if (!params.redirectUri) {
			throw new OAuthServiceError("invalid_request", "Missing redirect_uri.", 400);
		}
		if (!params.codeChallenge) {
			throw new OAuthServiceError("invalid_request", "Missing code_challenge.", 400);
		}
		if (params.codeChallengeMethod !== "S256") {
			throw new OAuthServiceError(
				"invalid_request",
				"code_challenge_method must be S256.",
				400
			);
		}

		const client = await this.clientRepo.getByClientIdentifier(params.clientId);
		if (!client) {
			throw new OAuthServiceError("unauthorized_client", "Unknown client.", 401);
		}

		const now = new Date();
		if (client.expiresAt && client.expiresAt <= now.toISOString()) {
			throw new OAuthServiceError(
				"unauthorized_client",
				"Client credentials have expired.",
				401
			);
		}

		const redirectUris = await this.clientRepo.getRedirectUris(client.id);
		if (!redirectUris.includes(params.redirectUri)) {
			throw new OAuthServiceError("invalid_request", "Invalid redirect_uri.", 400);
		}

		const requestedScopes = parseScopeParam(params.scope ?? undefined);
		const grants =
			requestedScopes.length > 0
				? await this.tokenRepo.getClientScopeGrantsByNames(client.id, requestedScopes)
				: await this.tokenRepo.getClientScopeGrants(client.id);

		if (requestedScopes.length > 0 && grants.length !== requestedScopes.length) {
			throw new OAuthServiceError(
				"invalid_scope",
				"Requested scopes are not allowed for this client.",
				400,
				{ redirectUri: params.redirectUri, state: params.state ?? undefined }
			);
		}

		const codeId = generateOpaqueSecret("code");
		const expiresAt = new Date(now.getTime() + AUTHORIZATION_CODE_TTL_SECONDS * 1000);

		await this.authorizationCodeRepo.create(
			{
				id: crypto.randomUUID(),
				code_id: codeId,
				client_id: client.id,
				redirect_uri: params.redirectUri,
				code_challenge: params.codeChallenge,
				code_challenge_method: params.codeChallengeMethod,
				subject: params.subject,
				expires_at: expiresAt.toISOString(),
				used_at: null,
				created_at: now.toISOString(),
			},
			grants.map((grant) => grant.clientScopeId)
		);

		const redirect = new URL(params.redirectUri);
		redirect.searchParams.set("code", codeId);
		if (params.state) {
			redirect.searchParams.set("state", params.state);
		}
		return { redirectTo: redirect.toString() };
	}
}
