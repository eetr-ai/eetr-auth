import type { SiteAdminApiClientsRepository } from "./site-admin-api-clients.repository";

export class SiteAdminApiClientsRepositoryD1 implements SiteAdminApiClientsRepository {
	constructor(private readonly db: D1Database) {}

	async listClientRowIds(): Promise<string[]> {
		const result = await this.db
			.prepare("SELECT client_row_id FROM site_admin_api_clients ORDER BY client_row_id")
			.all<{ client_row_id: string }>();
		return (result.results ?? []).map((r) => r.client_row_id);
	}

	async setClientRowIds(ids: string[]): Promise<void> {
		await this.db.prepare("DELETE FROM site_admin_api_clients").run();
		const unique = [...new Set(ids)];
		if (unique.length === 0) return;
		const stmts = unique.map((id) =>
			this.db.prepare("INSERT INTO site_admin_api_clients (client_row_id) VALUES (?)").bind(id)
		);
		await this.db.batch(stmts);
	}
}
