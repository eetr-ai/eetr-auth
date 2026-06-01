import type { Scope, ScopeRepository } from "@/lib/repositories/scope.repository";
import type { AdminAuditLogService } from "./admin-audit-log.service";
import { AUDIT_ACTION, AUDIT_RESOURCE } from "./audit-actions";

export interface ScopeServiceDependencies {
	scopeRepo: ScopeRepository;
	adminAuditLogService: AdminAuditLogService;
}

export class ScopeService {
	private readonly scopeRepo: ScopeRepository;
	private readonly adminAuditLogService: AdminAuditLogService;

	constructor({ scopeRepo, adminAuditLogService }: ScopeServiceDependencies) {
		this.scopeRepo = scopeRepo;
		this.adminAuditLogService = adminAuditLogService;
	}

	async list(): Promise<Scope[]> {
		return this.scopeRepo.list();
	}

	async getById(id: string): Promise<Scope | null> {
		return this.scopeRepo.getById(id);
	}

	async create(scopeName: string, actorUserId: string | null = null): Promise<Scope> {
		const name = scopeName.trim();
		const id = crypto.randomUUID();
		await this.scopeRepo.create(id, name);
		await this.adminAuditLogService.logAction({
			actorUserId,
			action: AUDIT_ACTION.scopeCreate,
			resourceType: AUDIT_RESOURCE.scope,
			resourceId: id,
			details: { scopeName: name },
		});
		return { id, scopeName: name };
	}

	async delete(id: string, actorUserId: string | null = null): Promise<{ ok: boolean; error?: string }> {
		const count = await this.scopeRepo.countClientScopes(id);
		if (count > 0) {
			return { ok: false, error: "Cannot delete scope that is assigned to clients" };
		}
		const existing = await this.scopeRepo.getById(id);
		await this.scopeRepo.delete(id);
		await this.adminAuditLogService.logAction({
			actorUserId,
			action: AUDIT_ACTION.scopeDelete,
			resourceType: AUDIT_RESOURCE.scope,
			resourceId: id,
			details: { scopeName: existing?.scopeName ?? null },
		});
		return { ok: true };
	}
}
