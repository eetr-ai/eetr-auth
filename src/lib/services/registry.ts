import type { RequestContext } from "@/lib/context/types";
import { UserService } from "./user.service";

export interface Services {
	userService: UserService;
}

/**
 * Returns per-request service instances. Call only from onServerAction or withApiContext.
 */
export function getServices(ctx: RequestContext): Services {
	return {
		userService: new UserService(ctx),
	};
}
