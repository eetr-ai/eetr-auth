import { getDb } from "@/lib/db";
import type { RequestContext } from "@/lib/context/types";
import { AdminRepositoryD1 } from "@/lib/repositories/admin.repository.d1";
import type { Admin } from "@/lib/repositories/admin.repository";
import { md5 } from "@/lib/auth/md5";

export class UserService {
	private readonly adminRepository: AdminRepositoryD1;

	constructor(ctx: RequestContext) {
		const db = getDb(ctx.env);
		this.adminRepository = new AdminRepositoryD1(db);
	}

	async getById(id: string): Promise<Admin | null> {
		return this.adminRepository.getById(id);
	}

	async createUser(username: string, password: string): Promise<Admin> {
		const id = crypto.randomUUID();
		const passwordHash = md5(password);
		await this.adminRepository.create(id, username, passwordHash);
		return { id, username };
	}
}
