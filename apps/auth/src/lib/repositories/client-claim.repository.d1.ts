import type {
	ClientClaim,
	ClientClaimInput,
	ClientClaimRepository,
} from "./client-claim.repository";

export class ClientClaimRepositoryD1 implements ClientClaimRepository {
	constructor(private readonly db: D1Database) {}

	async listByClient(clientId: string): Promise<ClientClaim[]> {
		const result = await this.db
			.prepare(
				[
					"SELECT id, client_id AS clientId, claim_name AS claimName,",
					"       claim_value AS claimValue, value_type AS valueType",
					"FROM client_claims WHERE client_id = ? ORDER BY claim_name",
				].join(" ")
			)
			.bind(clientId)
			.all<ClientClaim>();
		return (result.results ?? []) as ClientClaim[];
	}

	async setClientClaims(clientId: string, claims: ClientClaimInput[]): Promise<void> {
		// Delete-then-insert, like setClientScopes: the admin form submits the whole set, so
		// reconciling row-by-row would add complexity with no behavioural gain. Unlike
		// setClientScopes this goes through db.batch, which D1 runs as a transaction -- a
		// failed insert mid-way would otherwise leave the client with its claims deleted
		// and not replaced, silently changing the tokens it mints.
		const statements = [
			this.db.prepare("DELETE FROM client_claims WHERE client_id = ?").bind(clientId),
			...claims.map((claim) =>
				this.db
					.prepare(
						[
							"INSERT INTO client_claims (id, client_id, claim_name, claim_value, value_type)",
							"VALUES (?, ?, ?, ?, ?)",
						].join(" ")
					)
					.bind(
						crypto.randomUUID(),
						clientId,
						claim.claimName,
						claim.claimValue,
						claim.valueType
					)
			),
		];
		await this.db.batch(statements);
	}
}
