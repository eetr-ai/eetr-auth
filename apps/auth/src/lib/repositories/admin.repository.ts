export interface UserWithPassword {
	id: string;
	username: string;
	name: string | null;
	email: string | null;
	emailVerifiedAt: string | null;
	avatarKey: string | null;
	passwordHash: string;
	isAdmin: boolean;
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
}

export interface UserUpdateInput {
	username?: string;
	name?: string | null;
	email?: string | null;
	emailVerifiedAt?: string | null;
	avatarKey?: string | null;
	passwordHash?: string;
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
		isAdmin: boolean
	): Promise<void>;
	list(): Promise<UserRecord[]>;
	findByUsername(username: string): Promise<UserWithPassword | null>;
	findByEmail(email: string): Promise<UserWithPassword | null>;
	getById(id: string): Promise<UserRecord | null>;
	update(id: string, updates: UserUpdateInput): Promise<void>;
	delete(id: string): Promise<void>;
	/**
	 * Deletes a user and writes an audit log row atomically in a single D1 batch.
	 * Dependent rows (passkeys, challenges, etc.) cascade automatically via FK.
	 */
	deleteWithAudit(id: string, auditRow: AdminAuditLogRow): Promise<void>;
}
