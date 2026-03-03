import type { Admin, AdminRepository, AdminWithPassword } from "./admin.repository";

export class AdminRepositoryD1 implements AdminRepository {
	constructor(private readonly db: D1Database) {}

	async create(id: string, username: string, passwordHash: string): Promise<void> {
		await this.db
			.prepare("INSERT INTO admins (id, username, password_hash) VALUES (?, ?, ?)")
			.bind(id, username, passwordHash)
			.run();
	}

	async findByUsername(username: string): Promise<AdminWithPassword | null> {
		const result = await this.db
			.prepare("SELECT id, username, password_hash as passwordHash FROM admins WHERE username = ?")
			.bind(username)
			.first<{ id: string; username: string; passwordHash: string }>();
		return result ?? null;
	}

	async getById(id: string): Promise<Admin | null> {
		const result = await this.db
			.prepare("SELECT id, username FROM admins WHERE id = ?")
			.bind(id)
			.first<{ id: string; username: string }>();
		return result ?? null;
	}
}
