import type { Environment, EnvironmentRepository } from "@/lib/repositories/environment.repository";
import type { AdminAuditLogService } from "./admin-audit-log.service";
import { AUDIT_ACTION, AUDIT_RESOURCE } from "./audit-actions";

export interface EnvironmentServiceDependencies {
	envRepo: EnvironmentRepository;
	adminAuditLogService: AdminAuditLogService;
}

export class EnvironmentService {
	private readonly envRepo: EnvironmentRepository;
	private readonly adminAuditLogService: AdminAuditLogService;

	constructor({ envRepo, adminAuditLogService }: EnvironmentServiceDependencies) {
		this.envRepo = envRepo;
		this.adminAuditLogService = adminAuditLogService;
	}

	async list(): Promise<Environment[]> {
		return this.envRepo.list();
	}

	async getById(id: string): Promise<Environment | null> {
		return this.envRepo.getById(id);
	}

	async create(name: string, actorUserId: string | null = null): Promise<Environment> {
		const id = crypto.randomUUID();
		const trimmed = name.trim();
		await this.envRepo.create(id, trimmed);
		await this.adminAuditLogService.logAction({
			actorUserId,
			action: AUDIT_ACTION.environmentCreate,
			resourceType: AUDIT_RESOURCE.environment,
			resourceId: id,
			details: { name: trimmed },
		});
		return { id, name: trimmed };
	}

	async update(id: string, name: string, actorUserId: string | null = null): Promise<Environment | null> {
		const existing = await this.envRepo.getById(id);
		if (!existing) return null;
		const trimmed = name.trim();
		await this.envRepo.update(id, trimmed);
		await this.adminAuditLogService.logAction({
			actorUserId,
			action: AUDIT_ACTION.environmentUpdate,
			resourceType: AUDIT_RESOURCE.environment,
			resourceId: id,
			details: { from: existing.name, to: trimmed },
		});
		return { id, name: trimmed };
	}

	async delete(id: string, actorUserId: string | null = null): Promise<{ ok: boolean; error?: string }> {
		const count = await this.envRepo.countClientsByEnvironment(id);
		if (count > 0) {
			return { ok: false, error: "Cannot delete environment that has clients" };
		}
		const existing = await this.envRepo.getById(id);
		await this.envRepo.delete(id);
		await this.adminAuditLogService.logAction({
			actorUserId,
			action: AUDIT_ACTION.environmentDelete,
			resourceType: AUDIT_RESOURCE.environment,
			resourceId: id,
			details: { name: existing?.name ?? null },
		});
		return { ok: true };
	}
}
