export interface User {
	id: string;
	email: string;
	createdAt: string;
}

export interface UserRepository {
	getById(id: string): Promise<User | null>;
	findByEmail(email: string): Promise<User | null>;
}
