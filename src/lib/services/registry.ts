import type { RequestContext } from "@/lib/context/types";
import { UserService } from "./user.service";
import { EnvironmentService } from "./environment.service";
import { ScopeService } from "./scope.service";
import { ClientService } from "./client.service";

export interface Services {
	userService: UserService;
	environmentService: EnvironmentService;
	scopeService: ScopeService;
	clientService: ClientService;
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
	};
}
