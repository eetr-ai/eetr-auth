import type { Scope, ScopeRepository } from "./scope.repository";

export class ScopeRepositoryD1 implements ScopeRepository {
	constructor(private readonly db: D1Database) {}

	async list(): Promise<Scope[]> {
		const result = await this.db
			.prepare("SELECT id, scope_name as scopeName FROM scopes ORDER BY scope_name")
			.all<{ id: string; scopeName: string }>();
		return (result.results ?? []) as Scope[];
	}

	async getById(id: string): Promise<Scope | null> {
		const row = await this.db
			.prepare("SELECT id, scope_name as scopeName FROM scopes WHERE id = ?")
			.bind(id)
			.first<{ id: string; scopeName: string }>();
		return row ?? null;
	}

	async create(id: string, scopeName: string): Promise<void> {
		await this.db
			.prepare("INSERT INTO scopes (id, scope_name) VALUES (?, ?)")
			.bind(id, scopeName)
			.run();
	}

	async delete(id: string): Promise<void> {
		await this.db.prepare("DELETE FROM scopes WHERE id = ?").bind(id).run();
	}

	async countClientScopes(scopeId: string): Promise<number> {
		const result = await this.db
			.prepare("SELECT COUNT(*) as count FROM client_scopes WHERE scope_id = ?")
			.bind(scopeId)
			.first<{ count: number }>();
		return result?.count ?? 0;
	}
}
