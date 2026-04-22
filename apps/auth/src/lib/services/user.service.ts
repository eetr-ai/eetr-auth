import type { HashMethod } from "@/lib/config/hash-method";
import type { UserRecord, UserRepository } from "@/lib/repositories/admin.repository";
import { hashPassword } from "@/lib/auth/password-hash";
import { normalizeOptionalProfileField } from "@/lib/users/profile";
import type { AdminAuditLogService } from "./admin-audit-log.service";

interface UpdateUserInput {
	username?: string;
	name?: string | null;
	email?: string | null;
	password?: string;
	isAdmin?: boolean;
	avatarKey?: string | null;
	emailVerifiedAt?: string | null;
}

export interface UserServiceDependencies {
	userRepository: UserRepository;
	adminAuditLogService: AdminAuditLogService;
	avatarCdnBaseUrl: string;
	argonHasher?: Fetcher;
	hashMethod: HashMethod;
}

export class UserService {
	private readonly userRepository: UserRepository;
	private readonly adminAuditLogService: AdminAuditLogService;
	private readonly avatarCdnBaseUrl: string;
	private readonly argonHasher?: Fetcher;
	private readonly hashMethod: HashMethod;

	constructor({
		userRepository,
		adminAuditLogService,
		avatarCdnBaseUrl,
		argonHasher,
		hashMethod,
	}: UserServiceDependencies) {
		this.userRepository = userRepository;
		this.adminAuditLogService = adminAuditLogService;
		this.avatarCdnBaseUrl = avatarCdnBaseUrl.replace(/\/+$/, "");
		this.argonHasher = argonHasher;
		this.hashMethod = hashMethod;
	}

	private async resolveUser(idOrUsername: string): Promise<UserRecord | null> {
		const byId = await this.userRepository.getById(idOrUsername);
		if (byId) return byId;
		const byUsername = await this.userRepository.findByUsername(idOrUsername);
		if (!byUsername) return null;
		return {
			id: byUsername.id,
			username: byUsername.username,
			name: byUsername.name,
			email: byUsername.email,
			emailVerifiedAt: byUsername.emailVerifiedAt,
			avatarKey: byUsername.avatarKey,
			isAdmin: byUsername.isAdmin,
		};
	}

	private withAvatarUrl(user: UserRecord): UserRecord {
		const avatarUrl = user.avatarKey
			? `${this.avatarCdnBaseUrl}/${user.avatarKey.replace(/^\/+/, "")}`
			: null;

		return {
			...user,
			avatarUrl,
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

	async getByIdOrUsername(idOrUsername: string): Promise<UserRecord | null> {
		const user = await this.resolveUser(idOrUsername);
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
		const passwordHash = await hashPassword(password, {
			argonHasher: this.argonHasher,
			hashMethod: this.hashMethod,
		});
		const normalizedName = normalizeOptionalProfileField(name);
		const normalizedEmail = normalizeOptionalProfileField(email);
		const emailVerifiedAt = isAdmin ? new Date().toISOString() : null;
		await this.userRepository.create(
			id,
			normalizedUsername,
			normalizedName,
			normalizedEmail,
			emailVerifiedAt,
			passwordHash,
			isAdmin
		);
		return this.withAvatarUrl({
			id,
			username: normalizedUsername,
			name: normalizedName,
			email: normalizedEmail,
			emailVerifiedAt,
			avatarKey: null,
			isAdmin,
		});
	}

	async updateUser(idOrUsername: string, updates: UpdateUserInput, actorUserId: string): Promise<UserRecord> {
		const current = await this.resolveUser(idOrUsername);
		if (!current) {
			throw new Error("User not found");
		}
		const id = current.id;

		const patch: {
			username?: string;
			name?: string | null;
			email?: string | null;
			emailVerifiedAt?: string | null;
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
			const nextEmail = normalizeOptionalProfileField(updates.email);
			patch.email = nextEmail;
			if (!current.isAdmin) {
				const currentEmail = current.email?.trim().toLowerCase() ?? null;
				const normalizedNextEmail = nextEmail?.trim().toLowerCase() ?? null;
				if (currentEmail !== normalizedNextEmail) {
					patch.emailVerifiedAt = null;
				}
			}
		}
		if (updates.emailVerifiedAt !== undefined) {
			patch.emailVerifiedAt = updates.emailVerifiedAt;
		}
		if (updates.password !== undefined && updates.password.trim()) {
			patch.passwordHash = await hashPassword(updates.password, {
				argonHasher: this.argonHasher,
				hashMethod: this.hashMethod,
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

	async deleteUser(idOrUsername: string, actorUserId: string): Promise<void> {
		const current = await this.resolveUser(idOrUsername);
		if (!current) {
			throw new Error("User not found");
		}
		const id = current.id;
		if (id === actorUserId) {
			throw new Error("You cannot delete your own user");
		}
		if (current.isAdmin) {
			const users = await this.userRepository.list();
			const adminCount = users.filter((user) => user.isAdmin).length;
			if (adminCount <= 1) {
				throw new Error("Cannot delete the last admin");
			}
		}

		const auditRow = this.adminAuditLogService.buildRow({
			actorUserId,
			action: "user.delete",
			resourceType: "user",
			resourceId: id,
			details: {
				username: current.username,
				email: current.email,
				name: current.name,
				isAdmin: current.isAdmin,
			},
		});
		await this.userRepository.deleteWithAudit(id, auditRow);
	}
}
