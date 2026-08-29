import type {
	Client,
	ClientRepository,
	ClientRow,
} from "./client.repository";

function rowToClient(row: {
	id: string;
	client_id: string;
	client_secret: string;
	environment_id: string;
	created_by_display: string;
	expires_at: string | null;
	name: string | null;
	token_endpoint_auth_method: string;
	is_dynamic: number;
	is_test: number;
}): Client {
	return {
		id: row.id,
		clientId: row.client_id,
		clientSecret: row.client_secret,
		environmentId: row.environment_id,
		createdBy: row.created_by_display,
		expiresAt: row.expires_at,
		name: row.name,
		tokenEndpointAuthMethod: row.token_endpoint_auth_method,
		isDynamic: row.is_dynamic === 1,
		isTest: row.is_test === 1,
	};
}

export class ClientRepositoryD1 implements ClientRepository {
	constructor(private readonly db: D1Database) {}

	async list(environmentId?: string): Promise<Client[]> {
		const query =
			environmentId != null
				? [
					"SELECT c.id, c.client_id, c.client_secret, c.environment_id,",
					"COALESCE(u.username, c.created_by, '(deleted user)') AS created_by_display,",
					"c.expires_at, c.name, c.token_endpoint_auth_method, c.is_dynamic, c.is_test",
					"FROM clients c",
					"LEFT JOIN users u ON u.id = c.created_by",
					"WHERE c.environment_id = ?",
					"ORDER BY c.client_id",
				].join(" ")
				: [
					"SELECT c.id, c.client_id, c.client_secret, c.environment_id,",
					"COALESCE(u.username, c.created_by, '(deleted user)') AS created_by_display,",
					"c.expires_at, c.name, c.token_endpoint_auth_method, c.is_dynamic, c.is_test",
					"FROM clients c",
					"LEFT JOIN users u ON u.id = c.created_by",
					"ORDER BY c.client_id",
				].join(" ");
		const stmt =
			environmentId != null
				? this.db.prepare(query).bind(environmentId)
				: this.db.prepare(query);
		const result = await stmt.all<{
			id: string;
			client_id: string;
			client_secret: string;
			environment_id: string;
			created_by_display: string;
			expires_at: string | null;
			name: string | null;
			token_endpoint_auth_method: string;
			is_dynamic: number;
			is_test: number;
		}>();
		return (result.results ?? []).map(rowToClient);
	}

	async getById(id: string): Promise<Client | null> {
		const row = await this.db
			.prepare(
				[
					"SELECT c.id, c.client_id, c.client_secret, c.environment_id,",
					"COALESCE(u.username, c.created_by, '(deleted user)') AS created_by_display,",
					"c.expires_at, c.name, c.token_endpoint_auth_method, c.is_dynamic, c.is_test",
					"FROM clients c",
					"LEFT JOIN users u ON u.id = c.created_by",
					"WHERE c.id = ?",
				].join(" ")
			)
			.bind(id)
			.first<{
				id: string;
				client_id: string;
				client_secret: string;
				environment_id: string;
				created_by_display: string;
				expires_at: string | null;
				name: string | null;
				token_endpoint_auth_method: string;
				is_dynamic: number;
				is_test: number;
			}>();
		return row ? rowToClient(row) : null;
	}

	async getByClientIdentifier(clientId: string): Promise<Client | null> {
		const row = await this.db
			.prepare(
				[
					"SELECT c.id, c.client_id, c.client_secret, c.environment_id,",
					"COALESCE(u.username, c.created_by, '(deleted user)') AS created_by_display,",
					"c.expires_at, c.name, c.token_endpoint_auth_method, c.is_dynamic, c.is_test",
					"FROM clients c",
					"LEFT JOIN users u ON u.id = c.created_by",
					"WHERE c.client_id = ?",
				].join(" ")
			)
			.bind(clientId)
			.first<{
				id: string;
				client_id: string;
				client_secret: string;
				environment_id: string;
				created_by_display: string;
				expires_at: string | null;
				name: string | null;
				token_endpoint_auth_method: string;
				is_dynamic: number;
				is_test: number;
			}>();
		return row ? rowToClient(row) : null;
	}

	async create(row: ClientRow): Promise<void> {
		await this.db
			.prepare(
				"INSERT INTO clients (id, client_id, client_secret, environment_id, created_by, expires_at, name, token_endpoint_auth_method, is_dynamic, is_test) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
			)
			.bind(
				row.id,
				row.client_id,
				row.client_secret,
				row.environment_id,
				row.created_by,
				row.expires_at ?? null,
				row.name ?? null,
				row.token_endpoint_auth_method,
				row.is_dynamic,
				row.is_test
			)
			.run();
	}

	async delete(id: string): Promise<void> {
		await this.db.prepare("DELETE FROM clients WHERE id = ?").bind(id).run();
	}

	async getRedirectUris(clientId: string): Promise<string[]> {
		const result = await this.db
			.prepare("SELECT redirect_uri FROM redirect_uris WHERE client_id = ? ORDER BY redirect_uri")
			.bind(clientId)
			.all<{ redirect_uri: string }>();
		return (result.results ?? []).map((r) => r.redirect_uri);
	}

	async setRedirectUris(clientId: string, uris: string[]): Promise<void> {
		await this.db
			.prepare("DELETE FROM redirect_uris WHERE client_id = ?")
			.bind(clientId)
			.run();
		for (const uri of uris) {
			if (!uri.trim()) continue;
			await this.db
				.prepare(
					"INSERT INTO redirect_uris (id, client_id, redirect_uri) VALUES (?, ?, ?)"
				)
				.bind(crypto.randomUUID(), clientId, uri.trim())
				.run();
		}
	}

	async getClientScopes(clientId: string): Promise<{ scopeId: string }[]> {
		const result = await this.db
			.prepare("SELECT scope_id as scopeId FROM client_scopes WHERE client_id = ?")
			.bind(clientId)
			.all<{ scopeId: string }>();
		return result.results ?? [];
	}

	async setClientScopes(clientId: string, scopeIds: string[]): Promise<void> {
		await this.db
			.prepare("DELETE FROM client_scopes WHERE client_id = ?")
			.bind(clientId)
			.run();
		for (const scopeId of scopeIds) {
			if (!scopeId) continue;
			await this.db
				.prepare(
					"INSERT INTO client_scopes (id, client_id, scope_id) VALUES (?, ?, ?)"
				)
				.bind(crypto.randomUUID(), clientId, scopeId)
				.run();
		}
	}

	async updateSecret(id: string, clientSecret: string): Promise<void> {
		await this.db
			.prepare("UPDATE clients SET client_secret = ? WHERE id = ?")
			.bind(clientSecret, id)
			.run();
	}

	async updateName(id: string, name: string | null): Promise<void> {
		await this.db
			.prepare("UPDATE clients SET name = ? WHERE id = ?")
			.bind(name, id)
			.run();
	}
}
