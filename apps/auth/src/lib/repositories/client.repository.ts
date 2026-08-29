import type { ClientClaim } from "./client-claim.repository";
export interface Client {
	id: string;
	clientId: string;
	clientSecret: string;
	environmentId: string;
	createdBy: string;
	expiresAt: string | null;
	name: string | null;
	// RFC 7591 token_endpoint_auth_method: 'client_secret_basic'/'client_secret_post'
	// (confidential, clientSecret is a real stored secret) or 'none' (public/PKCE-only,
	// clientSecret is the empty sentinel and is never verified).
	tokenEndpointAuthMethod: string;
	// True for clients created via Dynamic Client Registration (RFC 7591).
	isDynamic: boolean;
	// Test client: a normal OAuth client in every protocol respect, except that its
	// sign-in page lists only test users (users.is_test_user) instead of the password
	// form, and it is the only kind of client a test user may authenticate against.
	// Set at creation and immutable, like environmentId -- hence no setter below.
	isTest: boolean;
}

export interface ClientRow {
	id: string;
	client_id: string;
	client_secret: string;
	environment_id: string;
	created_by: string | null;
	expires_at: string | null;
	name: string | null;
	token_endpoint_auth_method: string;
	is_dynamic: number;
	is_test: number;
}

export interface ClientWithDetails extends Client {
	redirectUris: string[];
	scopeIds: string[];
	claims: ClientClaim[];
}

export interface ClientRepository {
	list(environmentId?: string): Promise<Client[]>;
	getById(id: string): Promise<Client | null>;
	getByClientIdentifier(clientId: string): Promise<Client | null>;
	create(row: ClientRow): Promise<void>;
	delete(id: string): Promise<void>;
	getRedirectUris(clientId: string): Promise<string[]>;
	setRedirectUris(clientId: string, uris: string[]): Promise<void>;
	getClientScopes(clientId: string): Promise<{ scopeId: string }[]>;
	setClientScopes(clientId: string, scopeIds: string[]): Promise<void>;
	updateSecret(id: string, clientSecret: string): Promise<void>;
	updateName(id: string, name: string | null): Promise<void>;
}
