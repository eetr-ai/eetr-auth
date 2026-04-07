import type { RequestContext } from "@/lib/context/types";
import { getDb } from "@/lib/db";
import { ClientRepositoryD1 } from "@/lib/repositories/client.repository.d1";
import { TokenRepositoryD1 } from "@/lib/repositories/token.repository.d1";
import { AuthorizationCodeRepositoryD1 } from "@/lib/repositories/authorization-code.repository.d1";
import { UserRepositoryD1 } from "@/lib/repositories/admin.repository.d1";
import { UserChallengeRepositoryD1 } from "@/lib/repositories/user-challenge.repository.d1";
import { SiteSettingsRepositoryD1 } from "@/lib/repositories/site-settings.repository.d1";
import { RefreshTokenRepositoryD1 } from "@/lib/repositories/refresh-token.repository.d1";
import { EnvironmentRepositoryD1 } from "@/lib/repositories/environment.repository.d1";
import { PasskeyRepositoryD1 } from "@/lib/repositories/passkey.repository.d1";
import { ScopeRepositoryD1 } from "@/lib/repositories/scope.repository.d1";
import { TokenActivityLogRepositoryD1 } from "@/lib/repositories/token-activity-log.repository.d1";
import { SiteAdminApiClientsRepositoryD1 } from "@/lib/repositories/site-admin-api-clients.repository.d1";
import { resolveHashMethod } from "@/lib/config/hash-method";
import { getAvatarCdnBaseUrl } from "@/lib/users/profile";
import { UserService } from "./user.service";
import { EnvironmentService } from "./environment.service";
import { ScopeService } from "./scope.service";
import { ClientService } from "./client.service";
import { OauthAuthorizationService } from "./oauth-authorization.service";
import { OauthTokenService } from "./oauth-token.service";
import { TokenActivityLogService } from "./token-activity-log.service";
import { SiteSettingsService } from "./site-settings.service";
import { UserChallengeService } from "./user-challenge.service";
import { PasskeyService } from "./passkey.service";
import { TransactionalEmailService } from "./transactional-email.service";

export interface Services {
	userService: UserService;
	environmentService: EnvironmentService;
	scopeService: ScopeService;
	clientService: ClientService;
	oauthAuthorizationService: OauthAuthorizationService;
	oauthTokenService: OauthTokenService;
	tokenActivityLogService: TokenActivityLogService;
	siteSettingsService: SiteSettingsService;
	userChallengeService: UserChallengeService;
	passkeyService: PasskeyService;
}

function resolveOptionalEnvString(env: Record<string, unknown>, key: string): string | null {
	const value = env[key];
	if (typeof value !== "string") {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

/**
 * Returns per-request service instances. Call only from onServerAction or withApiContext.
 */
export function getServices(ctx: RequestContext): Services {
	const db = getDb(ctx.env);
	const resolvedEnv = ctx.env as unknown as Record<string, unknown>;
	const clientRepo = new ClientRepositoryD1(db);
	const tokenRepo = new TokenRepositoryD1(db);
	const authorizationCodeRepo = new AuthorizationCodeRepositoryD1(db);
	const refreshTokenRepo = new RefreshTokenRepositoryD1(db);
	const envRepo = new EnvironmentRepositoryD1(db);
	const userRepo = new UserRepositoryD1(db);
	const challengeRepo = new UserChallengeRepositoryD1(db);
	const siteRepo = new SiteSettingsRepositoryD1(db);
	const passkeyRepo = new PasskeyRepositoryD1(db);
	const scopeRepo = new ScopeRepositoryD1(db);
	const tokenActivityLogRepo = new TokenActivityLogRepositoryD1(db);
	const adminClientsRepo = new SiteAdminApiClientsRepositoryD1(db);
	const avatarCdnBaseUrl = getAvatarCdnBaseUrl(resolvedEnv);
	const hashMethod = resolveHashMethod(resolvedEnv);
	const siteSettingsService = new SiteSettingsService({
		siteRepo,
		adminClientsRepo,
		clientRepo,
		avatarCdnBaseUrl,
		resendApiKey: resolveOptionalEnvString(resolvedEnv, "RESEND_API_KEY"),
	});
	const transactionalEmailService = new TransactionalEmailService(ctx);

	return {
		userService: new UserService({
			userRepository: userRepo,
			avatarCdnBaseUrl,
			argonHasher: ctx.env.ARGON_HASHER,
			hashMethod,
		}),
		environmentService: new EnvironmentService({ envRepo }),
		scopeService: new ScopeService({ scopeRepo }),
		clientService: new ClientService({
			clientRepo,
			env: ctx.env,
		}),
		siteSettingsService,
		oauthAuthorizationService: new OauthAuthorizationService({
			clientRepo,
			tokenRepo,
			authorizationCodeRepo,
		}),
		oauthTokenService: new OauthTokenService({
			clientRepo,
			authorizationCodeRepo,
			tokenRepo,
			refreshTokenRepo,
			envRepo,
			env: ctx.env,
		}),
		tokenActivityLogService: new TokenActivityLogService({
			logRepo: tokenActivityLogRepo,
			clientRepo,
			envRepo,
		}),
		userChallengeService: new UserChallengeService({
			userRepo,
			challengeRepo,
			siteRepo,
			siteSettings: siteSettingsService,
			mail: transactionalEmailService,
			env: ctx.env,
		}),
		passkeyService: new PasskeyService({
			repo: passkeyRepo,
			userRepo,
			siteRepo,
			env: ctx.env,
		}),
	};
}
