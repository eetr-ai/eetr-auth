import type { Environment, EnvironmentRepository } from "@/lib/repositories/environment.repository";

export interface EnvironmentServiceDependencies {
	envRepo: EnvironmentRepository;
}

export class EnvironmentService {
	private readonly envRepo: EnvironmentRepository;

	constructor({ envRepo }: EnvironmentServiceDependencies) {
		this.envRepo = envRepo;
	}

	async list(): Promise<Environment[]> {
		return this.envRepo.list();
	}

	async getById(id: string): Promise<Environment | null> {
		return this.envRepo.getById(id);
	}

	async create(name: string): Promise<Environment> {
		const id = crypto.randomUUID();
		await this.envRepo.create(id, name.trim());
		return { id, name: name.trim() };
	}

	async update(id: string, name: string): Promise<Environment | null> {
		const existing = await this.envRepo.getById(id);
		if (!existing) return null;
		await this.envRepo.update(id, name.trim());
		return { id, name: name.trim() };
	}

	async delete(id: string): Promise<{ ok: boolean; error?: string }> {
		const count = await this.envRepo.countClientsByEnvironment(id);
		if (count > 0) {
			return { ok: false, error: "Cannot delete environment that has clients" };
		}
		await this.envRepo.delete(id);
		return { ok: true };
	}
}
