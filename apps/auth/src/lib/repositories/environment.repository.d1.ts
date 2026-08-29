import type { Environment, EnvironmentRepository } from "./environment.repository";

export class EnvironmentRepositoryD1 implements EnvironmentRepository {
	constructor(private readonly db: D1Database) {}

	async list(): Promise<Environment[]> {
		const result = await this.db
			.prepare("SELECT id, name, display_name as displayName FROM environments ORDER BY name")
			.all<Environment>();
		return (result.results ?? []) as Environment[];
	}

	async getById(id: string): Promise<Environment | null> {
		const row = await this.db
			.prepare("SELECT id, name, display_name as displayName FROM environments WHERE id = ?")
			.bind(id)
			.first<Environment>();
		return row ?? null;
	}

	async create(id: string, name: string, displayName: string | null): Promise<void> {
		await this.db
			.prepare("INSERT INTO environments (id, name, display_name) VALUES (?, ?, ?)")
			.bind(id, name, displayName)
			.run();
	}

	async update(id: string, name: string, displayName: string | null): Promise<void> {
		await this.db
			.prepare("UPDATE environments SET name = ?, display_name = ? WHERE id = ?")
			.bind(name, displayName, id)
			.run();
	}

	async delete(id: string): Promise<void> {
		await this.db.prepare("DELETE FROM environments WHERE id = ?").bind(id).run();
	}

	async countClientsByEnvironment(envId: string): Promise<number> {
		const result = await this.db
			.prepare("SELECT COUNT(*) as count FROM clients WHERE environment_id = ?")
			.bind(envId)
			.first<{ count: number }>();
		return result?.count ?? 0;
	}
}
