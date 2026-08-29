export interface Environment {
	id: string;
	/**
	 * The stable IDENTIFIER, not a label. This value is emitted as the `environment` JWT
	 * claim, is the `environmentName` callers send to POST /api/token/validate, and is
	 * denormalized into token_activity_log.environment_name -- renaming it breaks live
	 * token validation and orphans historical log rows.
	 *
	 * Use {@link environmentLabel} for anything user-facing.
	 */
	name: string;
	/** Human-facing label for the admin UI. NULL means "not set"; surfaces fall back to `name`. */
	displayName: string | null;
}

/**
 * What to show a human for an environment. Falls back to `name` when no label is set, so
 * the display keeps tracking a rename until an admin writes one explicitly.
 *
 * Never use this where the environment identifier is required (JWT claim, token
 * validation, activity-log rows) -- those must use `name`.
 */
export function environmentLabel(env: Pick<Environment, "name" | "displayName">): string {
	return env.displayName?.trim() || env.name;
}

export interface EnvironmentRepository {
	list(): Promise<Environment[]>;
	getById(id: string): Promise<Environment | null>;
	create(id: string, name: string, displayName: string | null): Promise<void>;
	update(id: string, name: string, displayName: string | null): Promise<void>;
	delete(id: string): Promise<void>;
	countClientsByEnvironment(envId: string): Promise<number>;
}
