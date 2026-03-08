export interface UserWithPassword {
	id: string;
	username: string;
	name: string | null;
	email: string | null;
	avatarKey: string | null;
	passwordHash: string;
	isAdmin: boolean;
}

export interface UserRecord {
	id: string;
	username: string;
	name: string | null;
	email: string | null;
	avatarKey: string | null;
	avatarUrl?: string | null;
	isAdmin: boolean;
}

export interface UserUpdateInput {
	username?: string;
	name?: string | null;
	email?: string | null;
	avatarKey?: string | null;
	passwordHash?: string;
	isAdmin?: boolean;
}

export interface UserRepository {
	create(
		id: string,
		username: string,
		name: string | null,
		email: string | null,
		passwordHash: string,
		isAdmin: boolean
	): Promise<void>;
	list(): Promise<UserRecord[]>;
	findByUsername(username: string): Promise<UserWithPassword | null>;
	getById(id: string): Promise<UserRecord | null>;
	update(id: string, updates: UserUpdateInput): Promise<void>;
	delete(id: string): Promise<void>;
}
