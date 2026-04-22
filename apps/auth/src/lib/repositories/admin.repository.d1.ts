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
		isAdmin: boolean
	): Promise<void> {
		await this.db
			.prepare(
				"INSERT INTO users (id, username, name, email, email_verified_at, password_hash, is_admin) VALUES (?, ?, ?, ?, ?, ?, ?)"
			)
			.bind(id, username, name, email, emailVerifiedAt, passwordHash, isAdmin ? 1 : 0)
			.run();
	}

	async list(): Promise<UserRecord[]> {
		const result = await this.db
			.prepare(
				"SELECT id, username, name, email, email_verified_at as emailVerifiedAt, avatar_key as avatarKey, is_admin as isAdmin FROM users ORDER BY username"
			)
			.all<{
				id: string;
				username: string;
				name: string | null;
				email: string | null;
				emailVerifiedAt: string | null;
				avatarKey: string | null;
				isAdmin: number;
			}>();
		return (result.results ?? []).map((row) => ({
			id: row.id,
			username: row.username,
			name: row.name,
			email: row.email,
			emailVerifiedAt: row.emailVerifiedAt,
			avatarKey: row.avatarKey,
			isAdmin: !!row.isAdmin,
		}));
	}

	async findByUsername(username: string): Promise<UserWithPassword | null> {
		const result = await this.db
			.prepare(
				"SELECT id, username, name, email, email_verified_at as emailVerifiedAt, avatar_key as avatarKey, password_hash as passwordHash, is_admin as isAdmin FROM users WHERE username = ?"
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
				isAdmin: number;
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
					isAdmin: !!result.isAdmin,
				}
			: null;
	}

	async findByEmail(email: string): Promise<UserWithPassword | null> {
		const normalized = email.trim().toLowerCase();
		if (!normalized) return null;
		const result = await this.db
			.prepare(
				"SELECT id, username, name, email, email_verified_at as emailVerifiedAt, avatar_key as avatarKey, password_hash as passwordHash, is_admin as isAdmin FROM users WHERE lower(trim(email)) = ?"
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
				isAdmin: number;
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
					isAdmin: !!result.isAdmin,
				}
			: null;
	}

	async getById(id: string): Promise<UserRecord | null> {
		const result = await this.db
			.prepare(
				"SELECT id, username, name, email, email_verified_at as emailVerifiedAt, avatar_key as avatarKey, is_admin as isAdmin FROM users WHERE id = ?"
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
