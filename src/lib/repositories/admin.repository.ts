export interface AdminWithPassword {
	id: string;
	username: string;
	passwordHash: string;
}

export interface Admin {
	id: string;
	username: string;
}

export interface AdminRepository {
	create(id: string, username: string, passwordHash: string): Promise<void>;
	findByUsername(username: string): Promise<AdminWithPassword | null>;
	getById(id: string): Promise<Admin | null>;
}
