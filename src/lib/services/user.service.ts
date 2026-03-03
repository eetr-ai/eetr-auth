import { getDb } from "@/lib/db";
import type { RequestContext } from "@/lib/context/types";
import { UserRepositoryD1 } from "@/lib/repositories/admin.repository.d1";
import type { UserRecord } from "@/lib/repositories/admin.repository";
import { md5 } from "@/lib/auth/md5";

interface UpdateUserInput {
	username?: string;
	password?: string;
	isAdmin?: boolean;
}

export class UserService {
	private readonly userRepository: UserRepositoryD1;

	constructor(ctx: RequestContext) {
		const db = getDb(ctx.env);
		this.userRepository = new UserRepositoryD1(db);
	}

	async listUsers(): Promise<UserRecord[]> {
		return this.userRepository.list();
	}

	async getById(id: string): Promise<UserRecord | null> {
		return this.userRepository.getById(id);
	}

	async createUser(username: string, password: string, isAdmin = true): Promise<UserRecord> {
		const normalizedUsername = username.trim();
		if (!normalizedUsername) {
			throw new Error("Username is required");
		}
		const id = crypto.randomUUID();
		const passwordHash = md5(password);
		await this.userRepository.create(id, normalizedUsername, passwordHash, isAdmin);
		return { id, username: normalizedUsername, isAdmin };
	}

	async updateUser(id: string, updates: UpdateUserInput, actorUserId: string): Promise<UserRecord> {
		const current = await this.userRepository.getById(id);
		if (!current) {
			throw new Error("User not found");
		}

		const patch: { username?: string; passwordHash?: string; isAdmin?: boolean } = {};
		if (updates.username !== undefined) {
			const username = updates.username.trim();
			if (!username) {
				throw new Error("Username is required");
			}
			patch.username = username;
		}
		if (updates.password !== undefined && updates.password.trim()) {
			patch.passwordHash = md5(updates.password);
		}
		if (updates.isAdmin !== undefined) {
			if (id === actorUserId && updates.isAdmin === false) {
				throw new Error("You cannot remove your own admin access");
			}
			if (current.isAdmin && updates.isAdmin === false) {
				const users = await this.userRepository.list();
				const adminCount = users.filter((user) => user.isAdmin).length;
				if (adminCount <= 1) {
					throw new Error("Cannot remove the last admin");
				}
			}
			patch.isAdmin = updates.isAdmin;
		}

		await this.userRepository.update(id, patch);
		const updated = await this.userRepository.getById(id);
		if (!updated) {
			throw new Error("User not found");
		}
		return updated;
	}

	async deleteUser(id: string, actorUserId: string): Promise<void> {
		if (id === actorUserId) {
			throw new Error("You cannot delete your own user");
		}

		const current = await this.userRepository.getById(id);
		if (!current) {
			throw new Error("User not found");
		}
		if (current.isAdmin) {
			const users = await this.userRepository.list();
			const adminCount = users.filter((user) => user.isAdmin).length;
			if (adminCount <= 1) {
				throw new Error("Cannot delete the last admin");
			}
		}

		await this.userRepository.delete(id);
	}
}
