import { getDb } from "@/lib/db";
import type { RequestContext } from "@/lib/context/types";
import { UserRepositoryD1 } from "@/lib/repositories/user.repository.d1";
import type { User } from "@/lib/repositories/user.repository";

export class UserService {
	private readonly userRepository: UserRepositoryD1;

	constructor(ctx: RequestContext) {
		const db = getDb(ctx.env);
		this.userRepository = new UserRepositoryD1(db);
	}

	async getById(id: string): Promise<User | null> {
		return this.userRepository.getById(id);
	}

	async getCurrentUser(_ctx: RequestContext): Promise<User | null> {
		// TODO: resolve userId from session/auth and return getById(userId)
		return null;
	}
}
