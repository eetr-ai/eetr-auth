import type {
	UserRecord,
	UserRepository,
	UserUpdateInput,
	UserWithPassword,
} from "./admin.repository";

export class UserRepositoryD1 implements UserRepository {
	constructor(private readonly db: D1Database) {}

	async create(
		id: string,
		username: string,
		name: string | null,
		email: string | null,
		passwordHash: string,
		isAdmin: boolean
	): Promise<void> {
		await this.db
			.prepare("INSERT INTO users (id, username, name, email, password_hash, is_admin) VALUES (?, ?, ?, ?, ?, ?)")
			.bind(id, username, name, email, passwordHash, isAdmin ? 1 : 0)
			.run();
	}

	async list(): Promise<UserRecord[]> {
		const result = await this.db
			.prepare("SELECT id, username, name, email, avatar_key as avatarKey, is_admin as isAdmin FROM users ORDER BY username")
			.all<{ id: string; username: string; name: string | null; email: string | null; avatarKey: string | null; isAdmin: number }>();
		return (result.results ?? []).map((row) => ({
			id: row.id,
			username: row.username,
			name: row.name,
			email: row.email,
			avatarKey: row.avatarKey,
			isAdmin: !!row.isAdmin,
		}));
	}

	async findByUsername(username: string): Promise<UserWithPassword | null> {
		const result = await this.db
			.prepare(
				"SELECT id, username, name, email, avatar_key as avatarKey, password_hash as passwordHash, is_admin as isAdmin FROM users WHERE username = ?"
			)
			.bind(username)
			.first<{ id: string; username: string; name: string | null; email: string | null; avatarKey: string | null; passwordHash: string; isAdmin: number }>();
		return result
			? {
					id: result.id,
					username: result.username,
					name: result.name,
					email: result.email,
					avatarKey: result.avatarKey,
					passwordHash: result.passwordHash,
					isAdmin: !!result.isAdmin,
				}
			: null;
	}

	async getById(id: string): Promise<UserRecord | null> {
		const result = await this.db
			.prepare("SELECT id, username, name, email, avatar_key as avatarKey, is_admin as isAdmin FROM users WHERE id = ?")
			.bind(id)
			.first<{ id: string; username: string; name: string | null; email: string | null; avatarKey: string | null; isAdmin: number }>();
		return result
			? {
					id: result.id,
					username: result.username,
					name: result.name,
					email: result.email,
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
}
