import type { Scope, ScopeCopy, ScopeRepository } from "./scope.repository";

const SELECT_COLUMNS =
	"id, scope_name as scopeName, display_name as displayName, description";

export class ScopeRepositoryD1 implements ScopeRepository {
	constructor(private readonly db: D1Database) {}

	async list(): Promise<Scope[]> {
		const result = await this.db
			.prepare(`SELECT ${SELECT_COLUMNS} FROM scopes ORDER BY scope_name`)
			.all<Scope>();
		return (result.results ?? []) as Scope[];
	}

	async getById(id: string): Promise<Scope | null> {
		const row = await this.db
			.prepare(`SELECT ${SELECT_COLUMNS} FROM scopes WHERE id = ?`)
			.bind(id)
			.first<Scope>();
		return row ?? null;
	}

	async listByNames(scopeNames: string[]): Promise<Scope[]> {
		if (scopeNames.length === 0) return [];
		const placeholders = scopeNames.map(() => "?").join(", ");
		const result = await this.db
			.prepare(
				`SELECT ${SELECT_COLUMNS} FROM scopes WHERE scope_name IN (${placeholders}) ORDER BY scope_name`
			)
			.bind(...scopeNames)
			.all<Scope>();
		return (result.results ?? []) as Scope[];
	}

	async create(id: string, scopeName: string, copy: ScopeCopy): Promise<void> {
		await this.db
			.prepare(
				"INSERT INTO scopes (id, scope_name, display_name, description) VALUES (?, ?, ?, ?)"
			)
			.bind(id, scopeName, copy.displayName, copy.description)
			.run();
	}

	async update(id: string, copy: ScopeCopy): Promise<void> {
		await this.db
			.prepare("UPDATE scopes SET display_name = ?, description = ? WHERE id = ?")
			.bind(copy.displayName, copy.description, id)
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
