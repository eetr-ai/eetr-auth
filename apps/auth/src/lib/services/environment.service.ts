import type { Environment, EnvironmentRepository } from "@/lib/repositories/environment.repository";
import type { AdminAuditLogService } from "./admin-audit-log.service";
import { AUDIT_ACTION, AUDIT_RESOURCE } from "./audit-actions";

/**
 * Trim the label and collapse blank input to NULL, so "no label" has a single
 * representation and every surface falls back to `name` consistently.
 */
function normalizeDisplayName(displayName: string | null | undefined): string | null {
	const trimmed = displayName?.trim();
	return trimmed ? trimmed : null;
}

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

	async create(
		name: string,
		displayName: string | null = null,
		actorUserId: string | null = null
	): Promise<Environment> {
		const id = crypto.randomUUID();
		const trimmed = name.trim();
		const label = normalizeDisplayName(displayName);
		await this.envRepo.create(id, trimmed, label);
		await this.adminAuditLogService.logAction({
			actorUserId,
			action: AUDIT_ACTION.environmentCreate,
			resourceType: AUDIT_RESOURCE.environment,
			resourceId: id,
			details: { name: trimmed, displayName: label },
		});
		return { id, name: trimmed, displayName: label };
	}

	async update(
		id: string,
		name: string,
		displayName: string | null = null,
		actorUserId: string | null = null
	): Promise<Environment | null> {
		const existing = await this.envRepo.getById(id);
		if (!existing) return null;
		const trimmed = name.trim();
		const label = normalizeDisplayName(displayName);
		await this.envRepo.update(id, trimmed, label);
		await this.adminAuditLogService.logAction({
			actorUserId,
			action: AUDIT_ACTION.environmentUpdate,
			resourceType: AUDIT_RESOURCE.environment,
			resourceId: id,
			details: {
				from: { name: existing.name, displayName: existing.displayName },
				to: { name: trimmed, displayName: label },
			},
		});
		return { id, name: trimmed, displayName: label };
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
