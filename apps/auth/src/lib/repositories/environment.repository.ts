export interface Environment {
	id: string;
	name: string;
}

export interface EnvironmentRepository {
	list(): Promise<Environment[]>;
	getById(id: string): Promise<Environment | null>;
	create(id: string, name: string): Promise<void>;
	update(id: string, name: string): Promise<void>;
	delete(id: string): Promise<void>;
	countClientsByEnvironment(envId: string): Promise<number>;
}
