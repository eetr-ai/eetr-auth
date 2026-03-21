import { getDb } from "@/lib/db";
import type { RequestContext } from "@/lib/context/types";
import { UserRepositoryD1 } from "@/lib/repositories/admin.repository.d1";
import type { UserRecord } from "@/lib/repositories/admin.repository";
import { hashPassword } from "@/lib/auth/password-hash";
import { getAvatarUrl, normalizeOptionalProfileField } from "@/lib/users/profile";

interface UpdateUserInput {
	username?: string;
	name?: string | null;
	email?: string | null;
	password?: string;
	isAdmin?: boolean;
	avatarKey?: string | null;
}

export class UserService {
	private readonly userRepository: UserRepositoryD1;
	private readonly env: Record<string, unknown>;
	private readonly cfEnv: CloudflareEnv;

	constructor(ctx: RequestContext) {
		const db = getDb(ctx.env);
		this.userRepository = new UserRepositoryD1(db);
		this.cfEnv = ctx.env;
		this.env = ctx.env as unknown as Record<string, unknown>;
	}

	private withAvatarUrl(user: UserRecord): UserRecord {
		return {
			...user,
			avatarUrl: getAvatarUrl(user.avatarKey, this.env),
		};
	}

	async listUsers(): Promise<UserRecord[]> {
		const users = await this.userRepository.list();
		return users.map((user) => this.withAvatarUrl(user));
	}

	async getById(id: string): Promise<UserRecord | null> {
		const user = await this.userRepository.getById(id);
		return user ? this.withAvatarUrl(user) : null;
	}

	async createUser(
		username: string,
		password: string,
		isAdmin = true,
		name?: string | null,
		email?: string | null
	): Promise<UserRecord> {
		const normalizedUsername = username.trim();
		if (!normalizedUsername) {
			throw new Error("Username is required");
		}
		const id = crypto.randomUUID();
		const passwordHash = await hashPassword(password, { argonHasher: this.cfEnv.ARGON_HASHER });
		const normalizedName = normalizeOptionalProfileField(name);
		const normalizedEmail = normalizeOptionalProfileField(email);
		await this.userRepository.create(
			id,
			normalizedUsername,
			normalizedName,
			normalizedEmail,
			passwordHash,
			isAdmin
		);
		return this.withAvatarUrl({
			id,
			username: normalizedUsername,
			name: normalizedName,
			email: normalizedEmail,
			avatarKey: null,
			isAdmin,
		});
	}

	async updateUser(id: string, updates: UpdateUserInput, actorUserId: string): Promise<UserRecord> {
		const current = await this.userRepository.getById(id);
		if (!current) {
			throw new Error("User not found");
		}

		const patch: {
			username?: string;
			name?: string | null;
			email?: string | null;
			passwordHash?: string;
			isAdmin?: boolean;
			avatarKey?: string | null;
		} = {};
		if (updates.username !== undefined) {
			const username = updates.username.trim();
			if (!username) {
				throw new Error("Username is required");
			}
			patch.username = username;
		}
		if (updates.name !== undefined) {
			patch.name = normalizeOptionalProfileField(updates.name);
		}
		if (updates.email !== undefined) {
			patch.email = normalizeOptionalProfileField(updates.email);
		}
		if (updates.password !== undefined && updates.password.trim()) {
			patch.passwordHash = await hashPassword(updates.password, {
				argonHasher: this.cfEnv.ARGON_HASHER,
			});
		}
		if (updates.avatarKey !== undefined) {
			patch.avatarKey = updates.avatarKey;
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
		return this.withAvatarUrl(updated);
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
