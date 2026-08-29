export interface ConsentRecord {
	id: string;
	userId: string;
	/** clients.id (the internal row id), not clients.client_id. */
	clientId: string;
	/** The scope names consented to, already split out of the stored string. */
	scopeNames: string[];
	createdAt: string;
	updatedAt: string;
}

/** A consent row joined with the client identity the admin surfaces need to display it. */
export interface ConsentWithClient extends ConsentRecord {
	/** clients.client_id — the public identifier. */
	clientIdentifier: string;
	clientName: string | null;
}

export interface ConsentRepository {
	get(userId: string, clientId: string): Promise<ConsentRecord | null>;
	listByUser(userId: string): Promise<ConsentWithClient[]>;
	/**
	 * Insert or replace the consented scope set for a (user, client) pair. The caller
	 * supplies the already-merged set; the repository only persists it.
	 */
	upsert(record: {
		id: string;
		userId: string;
		clientId: string;
		scopeNames: string[];
		now: string;
	}): Promise<void>;
	/** Returns true only if a row was actually removed. */
	delete(userId: string, clientId: string): Promise<boolean>;
}
