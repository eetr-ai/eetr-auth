import type { Scope, ScopeRepository } from "@/lib/repositories/scope.repository";

export interface ScopeServiceDependencies {
	scopeRepo: ScopeRepository;
}

export class ScopeService {
	private readonly scopeRepo: ScopeRepository;

	constructor({ scopeRepo }: ScopeServiceDependencies) {
		this.scopeRepo = scopeRepo;
	}

	async list(): Promise<Scope[]> {
		return this.scopeRepo.list();
	}

	async getById(id: string): Promise<Scope | null> {
		return this.scopeRepo.getById(id);
	}

	async create(scopeName: string): Promise<Scope> {
		const name = scopeName.trim();
		const id = crypto.randomUUID();
		await this.scopeRepo.create(id, name);
		return { id, scopeName: name };
	}

	async delete(id: string): Promise<{ ok: boolean; error?: string }> {
		const count = await this.scopeRepo.countClientScopes(id);
		if (count > 0) {
			return { ok: false, error: "Cannot delete scope that is assigned to clients" };
		}
		await this.scopeRepo.delete(id);
		return { ok: true };
	}
}
