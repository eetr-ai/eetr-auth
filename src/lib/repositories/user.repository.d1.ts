import type { User, UserRepository } from "./user.repository";

export class UserRepositoryD1 implements UserRepository {
	constructor(private readonly db: D1Database) {}

	async getById(id: string): Promise<User | null> {
		const result = await this.db
			.prepare("SELECT id, email, created_at as createdAt FROM users WHERE id = ?")
			.bind(id)
			.first<{ id: string; email: string; createdAt: string }>();
		return result ? { id: result.id, email: result.email, createdAt: result.createdAt } : null;
	}

	async findByEmail(email: string): Promise<User | null> {
		const result = await this.db
			.prepare("SELECT id, email, created_at as createdAt FROM users WHERE email = ?")
			.bind(email)
			.first<{ id: string; email: string; createdAt: string }>();
		return result ? { id: result.id, email: result.email, createdAt: result.createdAt } : null;
	}
}
