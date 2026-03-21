import type { RequestContext } from "@/lib/context/types";
import { UserService } from "./user.service";
import { EnvironmentService } from "./environment.service";
import { ScopeService } from "./scope.service";
import { ClientService } from "./client.service";
import { OauthAuthorizationService } from "./oauth-authorization.service";
import { OauthTokenService } from "./oauth-token.service";
import { TokenActivityLogService } from "./token-activity-log.service";
import { SiteSettingsService } from "./site-settings.service";
import { UserChallengeService } from "./user-challenge.service";

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
}

/**
 * Returns per-request service instances. Call only from onServerAction or withApiContext.
 */
export function getServices(ctx: RequestContext): Services {
	return {
		userService: new UserService(ctx),
		environmentService: new EnvironmentService(ctx),
		scopeService: new ScopeService(ctx),
		clientService: new ClientService(ctx),
		oauthAuthorizationService: new OauthAuthorizationService(ctx),
		oauthTokenService: new OauthTokenService(ctx),
		tokenActivityLogService: new TokenActivityLogService(ctx),
		siteSettingsService: new SiteSettingsService(ctx),
		userChallengeService: new UserChallengeService(ctx),
	};
}
