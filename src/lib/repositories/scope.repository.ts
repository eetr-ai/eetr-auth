export interface Scope {
	id: string;
	scopeName: string;
}

export interface ScopeRepository {
	list(): Promise<Scope[]>;
	getById(id: string): Promise<Scope | null>;
	create(id: string, scopeName: string): Promise<void>;
	delete(id: string): Promise<void>;
	countClientScopes(scopeId: string): Promise<number>;
}
