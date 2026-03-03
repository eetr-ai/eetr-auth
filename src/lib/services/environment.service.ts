import { getDb } from "@/lib/db";
import type { RequestContext } from "@/lib/context/types";
import { EnvironmentRepositoryD1 } from "@/lib/repositories/environment.repository.d1";
import type { Environment } from "@/lib/repositories/environment.repository";

export class EnvironmentService {
	private readonly envRepo: EnvironmentRepositoryD1;

	constructor(ctx: RequestContext) {
		const db = getDb(ctx.env);
		this.envRepo = new EnvironmentRepositoryD1(db);
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
