export interface Client {
	id: string;
	clientId: string;
	clientSecret: string;
	environmentId: string;
	createdBy: string;
	expiresAt: string | null;
}

export interface ClientRow {
	id: string;
	client_id: string;
	client_secret: string;
	environment_id: string;
	created_by: string;
	expires_at: string | null;
}

export interface ClientWithDetails extends Client {
	redirectUris: string[];
	scopeIds: string[];
}

export interface ClientRepository {
	list(environmentId?: string): Promise<Client[]>;
	getById(id: string): Promise<Client | null>;
	create(row: ClientRow): Promise<void>;
	delete(id: string): Promise<void>;
	getRedirectUris(clientId: string): Promise<string[]>;
	setRedirectUris(clientId: string, uris: string[]): Promise<void>;
	getClientScopes(clientId: string): Promise<{ scopeId: string }[]>;
	setClientScopes(clientId: string, scopeIds: string[]): Promise<void>;
	updateSecret(id: string, clientSecret: string): Promise<void>;
}
