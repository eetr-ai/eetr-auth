import type { HashMethod } from "@/lib/config/hash-method";
import type { UserRecord, UserRepository } from "@/lib/repositories/admin.repository";
import type { UserChallengeRepository } from "@/lib/repositories/user-challenge.repository";
import { hashPassword } from "@/lib/auth/password-hash";
import type { SiteSettingsRepository } from "@/lib/repositories/site-settings.repository";
import {
	buildAssetUrl,
	normalizeOptionalProfileField,
	pickAssetCdnBaseUrl,
} from "@/lib/users/profile";
import {
	StagedUploadError,
	extensionOfStagedKey,
	promoteStagedUpload,
	type AssetBucket,
} from "@/lib/uploads/staged-upload";
import type { AdminAuditLogService } from "./admin-audit-log.service";
import { AUDIT_ACTION, AUDIT_RESOURCE } from "./audit-actions";

interface UpdateUserInput {
	username?: string;
	name?: string | null;
	email?: string | null;
	password?: string;
	isAdmin?: boolean;
	avatarKey?: string | null;
	/** A `staging/` key from the upload endpoint, promoted to the final avatar on save. */
	avatarStagedKey?: string | null;
	emailVerifiedAt?: string | null;
	/** When provided, replaces the user's full set of environment grants. */
	environmentIds?: string[];
}

export interface UserServiceDependencies {
	userRepository: UserRepository;
	adminAuditLogService: AdminAuditLogService;
	/** Deploy-time default, used when Setup → Site identity has no CDN URL. */
	avatarCdnBaseUrl: string;
	/**
	 * Optional: when provided, the CDN URL configured in site settings takes
	 * precedence over `avatarCdnBaseUrl` when building avatar URLs.
	 */
	siteSettingsRepository?: SiteSettingsRepository;
	/** R2 bucket holding avatars. Absent in contexts that never write one. */
	assetBucket?: AssetBucket;
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
	private readonly siteSettingsRepository?: SiteSettingsRepository;
	private cdnBaseUrl?: Promise<string>;
	private readonly assetBucket?: AssetBucket;
	private readonly argonHasher?: Fetcher;
	private readonly hashMethod: HashMethod;
	private readonly userChallengeRepository?: UserChallengeRepository;

	constructor({
		userRepository,
		adminAuditLogService,
		avatarCdnBaseUrl,
		siteSettingsRepository,
		assetBucket,
		argonHasher,
		hashMethod,
		userChallengeRepository,
	}: UserServiceDependencies) {
		this.userRepository = userRepository;
		this.adminAuditLogService = adminAuditLogService;
		this.avatarCdnBaseUrl = avatarCdnBaseUrl.replace(/\/+$/, "");
		this.siteSettingsRepository = siteSettingsRepository;
		this.assetBucket = assetBucket;
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
			isTestUser: byUsername.isTestUser,
		};
	}

	/**
	 * The CDN base for avatars, preferring the site setting over the environment.
	 *
	 * Memoised because services are constructed per request: listing every user
	 * resolves the base once, not once per avatar.
	 */
	private resolveCdnBaseUrl(): Promise<string> {
		if (!this.siteSettingsRepository) return Promise.resolve(this.avatarCdnBaseUrl);
		this.cdnBaseUrl ??= this.siteSettingsRepository
			.get()
			.then((row) => pickAssetCdnBaseUrl(row?.cdnUrl, this.avatarCdnBaseUrl));
		return this.cdnBaseUrl;
	}

	private async withAvatarUrl(user: UserRecord): Promise<UserRecord> {
		if (!user.avatarKey) return { ...user, avatarUrl: null };
		return {
			...user,
			avatarUrl: buildAssetUrl(user.avatarKey, await this.resolveCdnBaseUrl()),
		};
	}

	async listUsers(): Promise<UserRecord[]> {
		const users = await this.userRepository.list();
		return Promise.all(users.map((user) => this.withAvatarUrl(user)));
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
		actorUserId: string | null = null,
		options: { isTestUser?: boolean } = {}
	): Promise<UserRecord> {
		const normalizedUsername = username.trim();
		if (!normalizedUsername) {
			throw new Error("Username is required");
		}
		const isTestUser = options.isTestUser === true;
		// A passwordless account that can reach the dashboard would be a critical hole.
		// The DB CHECK backstops this; refusing here turns it into a readable error rather
		// than a raw constraint failure surfaced in the admin banner.
		if (isTestUser && isAdmin) {
			throw new Error("A test user cannot be an admin.");
		}
		// The username is globally UNIQUE, and D1 would otherwise surface a raw
		// "UNIQUE constraint failed" string in the admin panel's save banner.
		if (await this.userRepository.findByUsername(normalizedUsername)) {
			throw new Error("That username is already taken.");
		}
		const id = crypto.randomUUID();
		// Test users are passwordless: store the empty sentinel, which verifyPassword()
		// matches against neither the Argon2 PHC prefix nor the 32-hex MD5 shape, so no
		// password can ever authenticate the row. Branching BEFORE hashPassword is load
		// bearing, not an optimisation -- it defaults to argon and throws without an
		// ARGON_HASHER binding, so routing a test user through it would fail creation
		// outright on any deployment that has not bound the hasher.
		const passwordHash = isTestUser
			? ""
			: await hashPassword(password, {
					argonHasher: this.argonHasher,
					hashMethod: this.hashMethod,
				});
		const normalizedName = normalizeOptionalProfileField(name);
		const normalizedEmail = normalizeOptionalProfileField(email);
		// Admin-managed emails are trusted (auto-verified), but only when one is
		// actually provided. Stamping verification on a missing email leaves a stale
		// timestamp that later surfaces as "Verified" the moment an email is added.
		const emailVerifiedAt = isAdmin && normalizedEmail ? new Date().toISOString() : null;
		// No password was ever set, so there is no clock for the max-age gate to run.
		const passwordUpdatedAt = isTestUser ? null : new Date().toISOString();
		await this.userRepository.create(
			id,
			normalizedUsername,
			normalizedName,
			normalizedEmail,
			emailVerifiedAt,
			passwordHash,
			passwordUpdatedAt,
			isAdmin,
			isTestUser
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
				isTestUser,
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
			isTestUser,
		});
	}

	/**
	 * Test users granted `environmentId` -- the one-click picker on a test client's
	 * sign-in page. Avatar URLs are resolved the same way listUsers() does.
	 */
	async listTestUsersForEnvironment(environmentId: string): Promise<UserRecord[]> {
		const users = await this.userRepository.listTestUsersByEnvironment(environmentId);
		return Promise.all(users.map((user) => this.withAvatarUrl(user)));
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
			// A test user is passwordless by construction. Nothing in the dashboard offers this
			// (the field is disabled) but the admin bearer API accepts `password` for any user,
			// and storing a hash here would leave a real credential on an account that is also
			// signable with one click -- precisely the state is_test_user's immutability exists
			// to prevent. Refuse rather than silently drop it, so the caller learns the write
			// did not happen.
			if (current.isTestUser) {
				throw new Error("A test user cannot be given a password.");
			}
			patch.passwordHash = await hashPassword(updates.password, {
				argonHasher: this.argonHasher,
				hashMethod: this.hashMethod,
			});
			patch.passwordUpdatedAt = new Date().toISOString();
		}
		if (updates.avatarStagedKey && !this.assetBucket) {
			throw new StagedUploadError("Avatar storage is not configured.");
		}
		if (!updates.avatarStagedKey && updates.avatarKey !== undefined) {
			patch.avatarKey = updates.avatarKey;
		}
		if (updates.isAdmin !== undefined) {
			// The DB CHECK also rejects this, but as a raw constraint failure surfaced in the
			// admin banner. A passwordless dashboard admin is the outcome worth naming.
			if (current.isTestUser && updates.isAdmin === true) {
				throw new Error("A test user cannot be an admin.");
			}
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

		// Promoted last, once nothing above can still reject: promotion overwrites
		// the live avatar, and a validation error afterwards would leave the new
		// picture in place on a save that never happened. The final key is derived
		// from the user id, never from anything the caller supplied.
		if (updates.avatarStagedKey && this.assetBucket) {
			const finalKey = `avatars/${id}.${extensionOfStagedKey(updates.avatarStagedKey)}`;
			await promoteStagedUpload(this.assetBucket, updates.avatarStagedKey, finalKey);
			patch.avatarKey = finalKey;
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
