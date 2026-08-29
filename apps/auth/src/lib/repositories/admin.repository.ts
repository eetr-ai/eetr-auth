export interface UserWithPassword {
	id: string;
	username: string;
	name: string | null;
	email: string | null;
	emailVerifiedAt: string | null;
	avatarKey: string | null;
	passwordHash: string;
	passwordUpdatedAt: string | null;
	isAdmin: boolean;
	isTestUser: boolean;
}

export interface UserRecord {
	id: string;
	username: string;
	name: string | null;
	email: string | null;
	emailVerifiedAt: string | null;
	avatarKey: string | null;
	avatarUrl?: string | null;
	isAdmin: boolean;
	/**
	 * Passwordless test user: signed in with one click from a test client's sign-in page,
	 * and refused by every non-test client. `passwordHash` is the empty sentinel ''.
	 * Set at creation and immutable -- deliberately absent from UserUpdateInput, because
	 * flipping a real user to a test user would leave a real password hash on an account
	 * signable with one click, and flipping back would leave an unusable account.
	 */
	isTestUser: boolean;
	/** Environments this user is granted access to. Populated by list(); may be omitted elsewhere. */
	environmentIds?: string[];
}

export interface UserUpdateInput {
	username?: string;
	name?: string | null;
	email?: string | null;
	emailVerifiedAt?: string | null;
	avatarKey?: string | null;
	passwordHash?: string;
	passwordUpdatedAt?: string | null;
	isAdmin?: boolean;
}

import type { AdminAuditLogRow } from "./admin-audit-log.repository";

export interface UserRepository {
	create(
		id: string,
		username: string,
		name: string | null,
		email: string | null,
		emailVerifiedAt: string | null,
		passwordHash: string,
		passwordUpdatedAt: string | null,
		isAdmin: boolean,
		isTestUser: boolean
	): Promise<void>;
	list(): Promise<UserRecord[]>;
	findByUsername(username: string): Promise<UserWithPassword | null>;
	findByEmail(email: string): Promise<UserWithPassword | null>;
	getById(id: string): Promise<UserRecord | null>;
	update(id: string, updates: UserUpdateInput): Promise<void>;
	delete(id: string): Promise<void>;
	/**
	 * Test users granted `environmentId`, for the one-click picker on a test client's
	 * sign-in page. Ordered by display name.
	 */
	listTestUsersByEnvironment(environmentId: string): Promise<UserRecord[]>;
	/** Environment IDs the user is granted (via users_environments). */
	getUserEnvironments(userId: string): Promise<string[]>;
	/** Replace the user's full set of environment grants. */
	setUserEnvironments(userId: string, environmentIds: string[]): Promise<void>;
	/**
	 * Deletes a user and writes an audit log row atomically in a single D1 batch.
	 * Dependent rows (passkeys, challenges, etc.) cascade automatically via FK.
	 */
	deleteWithAudit(id: string, auditRow: AdminAuditLogRow): Promise<void>;
}
