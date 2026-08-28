import type { Scope, ScopeCopy, ScopeRepository } from "@/lib/repositories/scope.repository";
import type { AdminAuditLogService } from "./admin-audit-log.service";
import { AUDIT_ACTION, AUDIT_RESOURCE } from "./audit-actions";

/**
 * Trim consent copy and collapse blank input to NULL, so "no copy" is a single
 * representation in the database rather than an empty string the UI has to special-case.
 */
function normalizeCopy(copy: Partial<ScopeCopy>): ScopeCopy {
	const displayName = copy.displayName?.trim();
	const description = copy.description?.trim();
	return {
		displayName: displayName ? displayName : null,
		description: description ? description : null,
	};
}

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

	async listByNames(scopeNames: string[]): Promise<Scope[]> {
		return this.scopeRepo.listByNames(scopeNames);
	}

	async create(
		scopeName: string,
		copy: Partial<ScopeCopy> = {},
		actorUserId: string | null = null
	): Promise<Scope> {
		const name = scopeName.trim();
		const id = crypto.randomUUID();
		const normalized = normalizeCopy(copy);
		await this.scopeRepo.create(id, name, normalized);
		await this.adminAuditLogService.logAction({
			actorUserId,
			action: AUDIT_ACTION.scopeCreate,
			resourceType: AUDIT_RESOURCE.scope,
			resourceId: id,
			details: { scopeName: name, ...normalized },
		});
		return { id, scopeName: name, ...normalized };
	}

	/**
	 * Update a scope's consent copy. `scopeName` is the protocol token clients send in
	 * `scope` and is deliberately not editable -- renaming it would silently break every
	 * client already requesting it, and every client_scopes grant referencing it.
	 */
	async update(
		id: string,
		copy: Partial<ScopeCopy>,
		actorUserId: string | null = null
	): Promise<Scope | null> {
		const existing = await this.scopeRepo.getById(id);
		if (!existing) return null;
		const normalized = normalizeCopy(copy);
		await this.scopeRepo.update(id, normalized);
		await this.adminAuditLogService.logAction({
			actorUserId,
			action: AUDIT_ACTION.scopeUpdate,
			resourceType: AUDIT_RESOURCE.scope,
			resourceId: id,
			details: {
				scopeName: existing.scopeName,
				from: { displayName: existing.displayName, description: existing.description },
				to: normalized,
			},
		});
		return { ...existing, ...normalized };
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
