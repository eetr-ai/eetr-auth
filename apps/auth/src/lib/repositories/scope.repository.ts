export interface Scope {
	id: string;
	scopeName: string;
	/**
	 * Short human-readable label for the consent screen (e.g. "Your email address").
	 * NULL when no copy has been written -- the consent UI falls back to `scopeName`.
	 */
	displayName: string | null;
	/**
	 * One-sentence explanation shown under the label on the consent screen.
	 * NULL when no copy has been written.
	 */
	description: string | null;
}

/** Optional consent-screen copy, shared by create and update. */
export interface ScopeCopy {
	displayName: string | null;
	description: string | null;
}

export interface ScopeRepository {
	list(): Promise<Scope[]>;
	getById(id: string): Promise<Scope | null>;
	/** Resolve scopes by protocol name. Used to render consent copy for a request. */
	listByNames(scopeNames: string[]): Promise<Scope[]>;
	create(id: string, scopeName: string, copy: ScopeCopy): Promise<void>;
	/** Update the consent copy only. `scope_name` is a protocol token and is never renamed. */
	update(id: string, copy: ScopeCopy): Promise<void>;
	delete(id: string): Promise<void>;
	countClientScopes(scopeId: string): Promise<number>;
}
