import type { ClientRepository } from "@/lib/repositories/client.repository";
import type { ClientScopeGrant, TokenRepository } from "@/lib/repositories/token.repository";
import type { AuthorizationCodeRepository } from "@/lib/repositories/authorization-code.repository";
import type { UserRepository } from "@/lib/repositories/admin.repository";
import { OAuthServiceError } from "./oauth.types";
import { normalizeResourceParam } from "./resource-indicator";
import { matchRegisteredRedirectUri } from "./loopback-uri";

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
	nonce?: string | null;
	// RFC 8707 resource indicator: the protected-resource URL the token is requested for.
	resource?: string | null;
}

export interface OauthAuthorizationServiceDeps {
	clientRepo: ClientRepository;
	tokenRepo: TokenRepository;
	authorizationCodeRepo: AuthorizationCodeRepository;
	userRepo: UserRepository;
}

export class OauthAuthorizationService {
	private readonly clientRepo: ClientRepository;
	private readonly tokenRepo: TokenRepository;
	private readonly authorizationCodeRepo: AuthorizationCodeRepository;
	private readonly userRepo: UserRepository;

	constructor({
		clientRepo,
		tokenRepo,
		authorizationCodeRepo,
		userRepo,
	}: OauthAuthorizationServiceDeps) {
		this.clientRepo = clientRepo;
		this.tokenRepo = tokenRepo;
		this.authorizationCodeRepo = authorizationCodeRepo;
		this.userRepo = userRepo;
	}


	/**
	 * Resolve the scope grants an authorize request actually covers.
	 *
	 * An authorize request with no `scope` means "every scope this client is granted" --
	 * the OAuth default this server has always applied. That rule lives here so the
	 * consent screen shows exactly the set `authorize` will bind to the code, rather than
	 * re-deriving it and risking the two drifting apart.
	 */
	async resolveClientScopeGrants(
		clientRowId: string,
		requestedScopeNames: string[]
	): Promise<ClientScopeGrant[]> {
		return requestedScopeNames.length > 0
			? this.tokenRepo.getClientScopeGrantsByNames(clientRowId, requestedScopeNames)
			: this.tokenRepo.getClientScopeGrants(clientRowId);
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

		// RFC 8707: validate the requested resource (if any) and bind it to the code so the
		// token endpoint can mint an access token whose `aud` is this resource.
		const resource = normalizeResourceParam(params.resource);

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

		// The user must be granted access to the environment this client belongs to.
		// Enforced for all users (admins are environment-scoped for OAuth, not bypassed).
		const userEnvironmentIds = await this.userRepo.getUserEnvironments(params.subject);
		if (!userEnvironmentIds.includes(client.environmentId)) {
			throw new OAuthServiceError(
				"access_denied",
				"You do not have access to this application.",
				403
			);
		}

		// Match loopback-tolerantly and carry the *registered* URI forward from here on: it is
		// the spelling the client told us about, so it is what the code binds to and where the
		// browser is sent. The token exchange receives redirect_uri in an unmangled request
		// body, and compares it against the code — which only lines up if we store this form.
		const redirectUris = await this.clientRepo.getRedirectUris(client.id);
		const redirectUri = matchRegisteredRedirectUri(params.redirectUri, redirectUris);
		if (!redirectUri) {
			// Log both sides: a mismatch here is almost always a spelling difference between
			// registration and request, which is invisible from the client-facing error alone.
			console.warn("[oauth_authorize] redirect_uri matched no registered URI", {
				clientId: client.clientId,
				requested: params.redirectUri,
				registered: redirectUris,
			});
			throw new OAuthServiceError("invalid_request", "Invalid redirect_uri.", 400);
		}

		const requestedScopes = parseScopeParam(params.scope ?? undefined);
		const grants = await this.resolveClientScopeGrants(client.id, requestedScopes);

		if (requestedScopes.length > 0 && grants.length !== requestedScopes.length) {
			throw new OAuthServiceError(
				"invalid_scope",
				"Requested scopes are not allowed for this client.",
				400,
				{ redirectUri, state: params.state ?? undefined }
			);
		}

		const codeId = generateOpaqueSecret("code");
		const expiresAt = new Date(now.getTime() + AUTHORIZATION_CODE_TTL_SECONDS * 1000);

		await this.authorizationCodeRepo.create(
			{
				id: crypto.randomUUID(),
				code_id: codeId,
				client_id: client.id,
				redirect_uri: redirectUri,
				code_challenge: params.codeChallenge,
				code_challenge_method: params.codeChallengeMethod,
				subject: params.subject,
				// OIDC: bind the request nonce and record the authentication time so the
				// token endpoint can emit `nonce`/`auth_time` in the id_token. auth_time is
				// approximated at code-creation time (the user is confirmed authenticated here).
				nonce: params.nonce ?? null,
				auth_time: now.toISOString(),
				expires_at: expiresAt.toISOString(),
				used_at: null,
				created_at: now.toISOString(),
				resource,
			},
			grants.map((grant) => grant.clientScopeId)
		);

		const redirect = new URL(redirectUri);
		redirect.searchParams.set("code", codeId);
		if (params.state) {
			redirect.searchParams.set("state", params.state);
		}
		return { redirectTo: redirect.toString() };
	}
}
