import type { HashMethod } from "@/lib/config/hash-method";
import type { UserRecord, UserRepository } from "@/lib/repositories/admin.repository";
import type { UserChallengeRepository } from "@/lib/repositories/user-challenge.repository";
import { hashPassword } from "@/lib/auth/password-hash";
import { normalizeOptionalProfileField } from "@/lib/users/profile";
import type { AdminAuditLogService } from "./admin-audit-log.service";
import { AUDIT_ACTION, AUDIT_RESOURCE } from "./audit-actions";

interface UpdateUserInput {
	username?: string;
	name?: string | null;
	email?: string | null;
	password?: string;
	isAdmin?: boolean;
	avatarKey?: string | null;
	emailVerifiedAt?: string | null;
	/** When provided, replaces the user's full set of environment grants. */
	environmentIds?: string[];
}

export interface UserServiceDependencies {
	userRepository: UserRepository;
	adminAuditLogService: AdminAuditLogService;
	avatarCdnBaseUrl: string;
	argonHasher?: Fetcher;
	hashMethod: HashMethod;
	/**
	 * Optional: when provided, a password change invalidates the user's pending
	 * self-service password-reset challenges (so an outstanding reset link stops working).
	 */
	userChallengeRepository?: UserChallengeRepository;
}

export class UserService {
	private readonly userRepository: UserRepository;
	private readonly adminAuditLogService: AdminAuditLogService;
	private readonly avatarCdnBaseUrl: string;
	private readonly argonHasher?: Fetcher;
	private readonly hashMethod: HashMethod;
	private readonly userChallengeRepository?: UserChallengeRepository;

	constructor({
		userRepository,
		adminAuditLogService,
		avatarCdnBaseUrl,
		argonHasher,
		hashMethod,
		userChallengeRepository,
	}: UserServiceDependencies) {
		this.userRepository = userRepository;
		this.adminAuditLogService = adminAuditLogService;
		this.avatarCdnBaseUrl = avatarCdnBaseUrl.replace(/\/+$/, "");
		this.argonHasher = argonHasher;
		this.hashMethod = hashMethod;
		this.userChallengeRepository = userChallengeRepository;
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

	/** Environment IDs the user is granted access to (via users_environments). */
	async getUserEnvironments(userId: string): Promise<string[]> {
		return this.userRepository.getUserEnvironments(userId);
	}

	async createUser(
		username: string,
		password: string,
		isAdmin = true,
		name?: string | null,
		email?: string | null,
		actorUserId: string | null = null
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
		// Admin-managed emails are trusted (auto-verified), but only when one is
		// actually provided. Stamping verification on a missing email leaves a stale
		// timestamp that later surfaces as "Verified" the moment an email is added.
		const emailVerifiedAt = isAdmin && normalizedEmail ? new Date().toISOString() : null;
		const passwordUpdatedAt = new Date().toISOString();
		await this.userRepository.create(
			id,
			normalizedUsername,
			normalizedName,
			normalizedEmail,
			emailVerifiedAt,
			passwordHash,
			passwordUpdatedAt,
			isAdmin
		);
		await this.adminAuditLogService.logAction({
			actorUserId,
			action: AUDIT_ACTION.userCreate,
			resourceType: AUDIT_RESOURCE.user,
			resourceId: id,
			details: {
				username: normalizedUsername,
				email: normalizedEmail,
				name: normalizedName,
				isAdmin,
			},
		});
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
			passwordUpdatedAt?: string | null;
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
			patch.passwordUpdatedAt = new Date().toISOString();
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
		// A password change invalidates any outstanding self-service reset links: a
		// previously-emailed reset token must not still be usable to set yet another
		// password after the password has already been changed by another path.
		if (patch.passwordHash !== undefined) {
			await this.userChallengeRepository?.deleteByUserIdAndKind(id, "password_reset");
		}
		// Environment grants live in a separate table; replace the full set when provided.
		const environmentsChanged = updates.environmentIds !== undefined;
		if (environmentsChanged) {
			await this.userRepository.setUserEnvironments(id, updates.environmentIds!);
		}
		const updated = await this.userRepository.getById(id);
		if (!updated) {
			throw new Error("User not found");
		}

		// Never log the password value — only that it changed. `passwordUpdatedAt` is
		// internal bookkeeping that always accompanies a password change, so exclude it
		// from the reported fields (and from the password-only detection below).
		const changedFields = Object.keys(patch)
			.filter((field) => field !== "passwordUpdatedAt")
			.map((field) => (field === "passwordHash" ? "password" : field));
		if (environmentsChanged) {
			changedFields.push("environments");
		}
		if (changedFields.length > 0) {
			const passwordOnly = changedFields.length === 1 && changedFields[0] === "password";
			await this.adminAuditLogService.logAction({
				actorUserId,
				action: passwordOnly ? AUDIT_ACTION.userPasswordChange : AUDIT_ACTION.userUpdate,
				resourceType: AUDIT_RESOURCE.user,
				resourceId: id,
				details: {
					username: updated.username,
					changedFields,
					...(environmentsChanged ? { environmentIds: updates.environmentIds } : {}),
				},
			});
		}

		// An admin-rights change is high-value: log it distinctly (in addition to the
		// generic user.update above) so privilege escalations are easy to find/alert on.
		if (patch.isAdmin !== undefined && patch.isAdmin !== current.isAdmin) {
			await this.adminAuditLogService.logAction({
				actorUserId,
				action: patch.isAdmin ? AUDIT_ACTION.userAdminGrant : AUDIT_ACTION.userAdminRevoke,
				resourceType: AUDIT_RESOURCE.user,
				resourceId: id,
				details: {
					username: updated.username,
					from: current.isAdmin,
					to: patch.isAdmin,
				},
			});
		}

		return this.withAvatarUrl(updated);
	}

	async deleteUser(idOrUsername: string, actorUserId: string): Promise<void> {
		if (idOrUsername === actorUserId) {
			throw new Error("You cannot delete your own user");
		}
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
			action: AUDIT_ACTION.userDelete,
			resourceType: AUDIT_RESOURCE.user,
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
