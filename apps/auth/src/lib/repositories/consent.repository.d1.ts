import type {
	ConsentRecord,
	ConsentRepository,
	ConsentWithClient,
} from "./consent.repository";

/**
 * `user_consents.scopes` is stored as a single space-delimited string, matching how the
 * `scope` parameter is carried everywhere else in the protocol. Split and join in one
 * place so the storage shape never leaks past this repository.
 */
function splitScopes(scopes: string): string[] {
	return scopes.split(/\s+/).filter(Boolean);
}

interface ConsentRow {
	id: string;
	userId: string;
	clientId: string;
	scopes: string;
	createdAt: string;
	updatedAt: string;
}

const SELECT_COLUMNS = [
	"id",
	"user_id AS userId",
	"client_id AS clientId",
	"scopes",
	"created_at AS createdAt",
	"updated_at AS updatedAt",
].join(", ");

function toRecord(row: ConsentRow): ConsentRecord {
	const { scopes, ...rest } = row;
	return { ...rest, scopeNames: splitScopes(scopes) };
}

export class ConsentRepositoryD1 implements ConsentRepository {
	constructor(private readonly db: D1Database) {}

	async get(userId: string, clientId: string): Promise<ConsentRecord | null> {
		const row = await this.db
			.prepare(
				`SELECT ${SELECT_COLUMNS} FROM user_consents WHERE user_id = ? AND client_id = ?`
			)
			.bind(userId, clientId)
			.first<ConsentRow>();
		return row ? toRecord(row) : null;
	}

	async listByUser(userId: string): Promise<ConsentWithClient[]> {
		const result = await this.db
			.prepare(
				[
					"SELECT uc.id, uc.user_id AS userId, uc.client_id AS clientId, uc.scopes,",
					"       uc.created_at AS createdAt, uc.updated_at AS updatedAt,",
					"       c.client_id AS clientIdentifier, c.name AS clientName",
					"FROM user_consents uc",
					"INNER JOIN clients c ON c.id = uc.client_id",
					"WHERE uc.user_id = ?",
					"ORDER BY c.name, c.client_id",
				].join(" ")
			)
			.bind(userId)
			.all<ConsentRow & { clientIdentifier: string; clientName: string | null }>();
		return (result.results ?? []).map((row) => ({
			...toRecord(row),
			clientIdentifier: row.clientIdentifier,
			clientName: row.clientName,
		}));
	}

	async upsert(record: {
		id: string;
		userId: string;
		clientId: string;
		scopeNames: string[];
		now: string;
	}): Promise<void> {
		await this.db
			.prepare(
				[
					"INSERT INTO user_consents (id, user_id, client_id, scopes, created_at, updated_at)",
					"VALUES (?, ?, ?, ?, ?, ?)",
					"ON CONFLICT(user_id, client_id) DO UPDATE SET",
					"  scopes = excluded.scopes,",
					"  updated_at = excluded.updated_at",
				].join(" ")
			)
			.bind(
				record.id,
				record.userId,
				record.clientId,
				record.scopeNames.join(" "),
				record.now,
				record.now
			)
			.run();
	}

	async delete(userId: string, clientId: string): Promise<boolean> {
		const result = await this.db
			.prepare("DELETE FROM user_consents WHERE user_id = ? AND client_id = ?")
			.bind(userId, clientId)
			.run();
		return Number(result.meta.changes ?? 0) > 0;
	}
}
