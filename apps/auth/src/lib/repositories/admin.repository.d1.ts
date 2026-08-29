import type {
	UserRecord,
	UserRepository,
	UserUpdateInput,
	UserWithPassword,
} from "./admin.repository";
import type { AdminAuditLogRow } from "./admin-audit-log.repository";

export class UserRepositoryD1 implements UserRepository {
	constructor(private readonly db: D1Database) {}

	async create(
		id: string,
		username: string,
		name: string | null,
		email: string | null,
		emailVerifiedAt: string | null,
		passwordHash: string,
		passwordUpdatedAt: string | null,
		isAdmin: boolean,
		isTestUser: boolean
	): Promise<void> {
		await this.db
			.prepare(
				"INSERT INTO users (id, username, name, email, email_verified_at, password_hash, password_updated_at, is_admin, is_test_user) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
			)
			.bind(
				id,
				username,
				name,
				email,
				emailVerifiedAt,
				passwordHash,
				passwordUpdatedAt,
				isAdmin ? 1 : 0,
				isTestUser ? 1 : 0
			)
			.run();
	}

	async list(): Promise<UserRecord[]> {
		const result = await this.db
			.prepare(
				"SELECT id, username, name, email, email_verified_at as emailVerifiedAt, avatar_key as avatarKey, is_admin as isAdmin, is_test_user as isTestUser FROM users ORDER BY username"
			)
			.all<{
				id: string;
				username: string;
				name: string | null;
				email: string | null;
				emailVerifiedAt: string | null;
				avatarKey: string | null;
				isAdmin: number;
				isTestUser: number;
			}>();
		const grants = await this.db
			.prepare("SELECT user_id as userId, environment_id as environmentId FROM users_environments")
			.all<{ userId: string; environmentId: string }>();
		const envByUser = new Map<string, string[]>();
		for (const row of grants.results ?? []) {
			const list = envByUser.get(row.userId) ?? [];
			list.push(row.environmentId);
			envByUser.set(row.userId, list);
		}
		return (result.results ?? []).map((row) => ({
			id: row.id,
			username: row.username,
			name: row.name,
			email: row.email,
			emailVerifiedAt: row.emailVerifiedAt,
			avatarKey: row.avatarKey,
			isAdmin: !!row.isAdmin,
			isTestUser: !!row.isTestUser,
			environmentIds: envByUser.get(row.id) ?? [],
		}));
	}

	async findByUsername(username: string): Promise<UserWithPassword | null> {
		const result = await this.db
			.prepare(
				"SELECT id, username, name, email, email_verified_at as emailVerifiedAt, avatar_key as avatarKey, password_hash as passwordHash, password_updated_at as passwordUpdatedAt, is_admin as isAdmin, is_test_user as isTestUser FROM users WHERE username = ?"
			)
			.bind(username)
			.first<{
				id: string;
				username: string;
				name: string | null;
				email: string | null;
				emailVerifiedAt: string | null;
				avatarKey: string | null;
				passwordHash: string;
				passwordUpdatedAt: string | null;
				isAdmin: number;
				isTestUser: number;
			}>();
		return result
			? {
					id: result.id,
					username: result.username,
					name: result.name,
					email: result.email,
					emailVerifiedAt: result.emailVerifiedAt,
					avatarKey: result.avatarKey,
					passwordHash: result.passwordHash,
					passwordUpdatedAt: result.passwordUpdatedAt,
					isAdmin: !!result.isAdmin,
					isTestUser: !!result.isTestUser,
				}
			: null;
	}

	async findByEmail(email: string): Promise<UserWithPassword | null> {
		const normalized = email.trim().toLowerCase();
		if (!normalized) return null;
		const result = await this.db
			.prepare(
				"SELECT id, username, name, email, email_verified_at as emailVerifiedAt, avatar_key as avatarKey, password_hash as passwordHash, password_updated_at as passwordUpdatedAt, is_admin as isAdmin, is_test_user as isTestUser FROM users WHERE lower(trim(email)) = ?"
			)
			.bind(normalized)
			.first<{
				id: string;
				username: string;
				name: string | null;
				email: string | null;
				emailVerifiedAt: string | null;
				avatarKey: string | null;
				passwordHash: string;
				passwordUpdatedAt: string | null;
				isAdmin: number;
				isTestUser: number;
			}>();
		return result
			? {
					id: result.id,
					username: result.username,
					name: result.name,
					email: result.email,
					emailVerifiedAt: result.emailVerifiedAt,
					avatarKey: result.avatarKey,
					passwordHash: result.passwordHash,
					passwordUpdatedAt: result.passwordUpdatedAt,
					isAdmin: !!result.isAdmin,
					isTestUser: !!result.isTestUser,
				}
			: null;
	}

	async getById(id: string): Promise<UserRecord | null> {
		const result = await this.db
			.prepare(
				"SELECT id, username, name, email, email_verified_at as emailVerifiedAt, avatar_key as avatarKey, is_admin as isAdmin, is_test_user as isTestUser FROM users WHERE id = ?"
			)
			.bind(id)
			.first<{
				id: string;
				username: string;
				name: string | null;
				email: string | null;
				emailVerifiedAt: string | null;
				avatarKey: string | null;
				isAdmin: number;
				isTestUser: number;
			}>();
		return result
			? {
					id: result.id,
					username: result.username,
					name: result.name,
					email: result.email,
					emailVerifiedAt: result.emailVerifiedAt,
					avatarKey: result.avatarKey,
					isAdmin: !!result.isAdmin,
					isTestUser: !!result.isTestUser,
				}
			: null;
	}

	async update(id: string, updates: UserUpdateInput): Promise<void> {
		const sets: string[] = [];
		const binds: Array<string | number | null> = [];

		if (updates.username !== undefined) {
			sets.push("username = ?");
			binds.push(updates.username);
		}
		if (updates.name !== undefined) {
			sets.push("name = ?");
			binds.push(updates.name);
		}
		if (updates.email !== undefined) {
			sets.push("email = ?");
			binds.push(updates.email);
		}
		if (updates.emailVerifiedAt !== undefined) {
			sets.push("email_verified_at = ?");
			binds.push(updates.emailVerifiedAt);
		}
		if (updates.avatarKey !== undefined) {
			sets.push("avatar_key = ?");
			binds.push(updates.avatarKey);
		}
		if (updates.passwordHash !== undefined) {
			sets.push("password_hash = ?");
			binds.push(updates.passwordHash);
		}
		if (updates.passwordUpdatedAt !== undefined) {
			sets.push("password_updated_at = ?");
			binds.push(updates.passwordUpdatedAt);
		}
		if (updates.isAdmin !== undefined) {
			sets.push("is_admin = ?");
			binds.push(updates.isAdmin ? 1 : 0);
		}
		if (sets.length === 0) return;

		binds.push(id);
		await this.db
			.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`)
			.bind(...binds)
			.run();
	}

	async delete(id: string): Promise<void> {
		await this.db.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
	}

	async listTestUsersByEnvironment(environmentId: string): Promise<UserRecord[]> {
		const result = await this.db
			.prepare(
				[
					"SELECT u.id, u.username, u.name, u.email,",
					"u.email_verified_at as emailVerifiedAt, u.avatar_key as avatarKey,",
					"u.is_admin as isAdmin, u.is_test_user as isTestUser",
					"FROM users u",
					"JOIN users_environments ue ON ue.user_id = u.id",
					// is_admin = 0 is redundant against the CHECK on the table, and deliberately
					// kept: this list is rendered as one-click sign-in buttons, so it must not be
					// able to offer an admin even on a database that predates the constraint.
					"WHERE u.is_test_user = 1 AND u.is_admin = 0 AND ue.environment_id = ?",
					"ORDER BY COALESCE(NULLIF(TRIM(u.name), ''), u.username)",
				].join(" ")
			)
			.bind(environmentId)
			.all<{
				id: string;
				username: string;
				name: string | null;
				email: string | null;
				emailVerifiedAt: string | null;
				avatarKey: string | null;
				isAdmin: number;
				isTestUser: number;
			}>();
		return (result.results ?? []).map((row) => ({
			id: row.id,
			username: row.username,
			name: row.name,
			email: row.email,
			emailVerifiedAt: row.emailVerifiedAt,
			avatarKey: row.avatarKey,
			isAdmin: !!row.isAdmin,
			isTestUser: !!row.isTestUser,
		}));
	}

	async getUserEnvironments(userId: string): Promise<string[]> {
		const result = await this.db
			.prepare("SELECT environment_id as environmentId FROM users_environments WHERE user_id = ?")
			.bind(userId)
			.all<{ environmentId: string }>();
		return (result.results ?? []).map((row) => row.environmentId);
	}

	async setUserEnvironments(userId: string, environmentIds: string[]): Promise<void> {
		const unique = [...new Set(environmentIds)];
		await this.db.batch([
			this.db.prepare("DELETE FROM users_environments WHERE user_id = ?").bind(userId),
			...unique.map((environmentId) =>
				this.db
					.prepare(
						"INSERT INTO users_environments (id, user_id, environment_id) VALUES (?, ?, ?)"
					)
					.bind(crypto.randomUUID(), userId, environmentId)
			),
		]);
	}

	async deleteWithAudit(id: string, auditRow: AdminAuditLogRow): Promise<void> {
		await this.db.batch([
			this.db
				.prepare(
					"INSERT INTO admin_audit_log (id, actor_user_id, action, resource_type, resource_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
				)
				.bind(
					auditRow.id,
					auditRow.actor_user_id,
					auditRow.action,
					auditRow.resource_type,
					auditRow.resource_id,
					auditRow.details,
					auditRow.created_at
				),
			this.db.prepare("DELETE FROM users WHERE id = ?").bind(id),
		]);
	}
}
