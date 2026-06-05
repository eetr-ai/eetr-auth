import type {
	CreatePasswordPolicyInput,
	PasswordPolicy,
	PasswordPolicyRepository,
	PasswordPolicyWithEnvironments,
	UpdatePasswordPolicyInput,
} from "./password-policy.repository";

interface PolicyRow {
	id: string;
	name: string;
	enabled: number;
	minLength: number;
	maxLength: number | null;
	requireUppercase: number;
	requireLowercase: number;
	requireNumber: number;
	requireSpecial: number;
	rejectContainsIdentifier: number;
	maxPasswordAgeDays: number;
	createdAt: string;
	updatedAt: string;
}

const POLICY_COLUMNS: Array<[column: string, alias: string]> = [
	["id", "id"],
	["name", "name"],
	["enabled", "enabled"],
	["min_length", "minLength"],
	["max_length", "maxLength"],
	["require_uppercase", "requireUppercase"],
	["require_lowercase", "requireLowercase"],
	["require_number", "requireNumber"],
	["require_special", "requireSpecial"],
	["reject_contains_identifier", "rejectContainsIdentifier"],
	["max_password_age_days", "maxPasswordAgeDays"],
	["created_at", "createdAt"],
	["updated_at", "updatedAt"],
];

/** Aliased column list, optionally table-qualified for JOINs where `id` is ambiguous. */
function selectColumns(prefix = ""): string {
	const qualifier = prefix ? `${prefix}.` : "";
	return POLICY_COLUMNS.map(([column, alias]) => `${qualifier}${column} as ${alias}`).join(", ");
}

function mapRow(row: PolicyRow): PasswordPolicy {
	return {
		id: row.id,
		name: row.name,
		enabled: !!row.enabled,
		minLength: row.minLength,
		maxLength: row.maxLength,
		requireUppercase: !!row.requireUppercase,
		requireLowercase: !!row.requireLowercase,
		requireNumber: !!row.requireNumber,
		requireSpecial: !!row.requireSpecial,
		rejectContainsIdentifier: !!row.rejectContainsIdentifier,
		maxPasswordAgeDays: row.maxPasswordAgeDays,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

export class PasswordPolicyRepositoryD1 implements PasswordPolicyRepository {
	constructor(private readonly db: D1Database) {}

	async list(): Promise<PasswordPolicy[]> {
		const result = await this.db
			.prepare(`SELECT ${selectColumns()} FROM password_policies ORDER BY name`)
			.all<PolicyRow>();
		return (result.results ?? []).map(mapRow);
	}

	async listWithEnvironments(): Promise<PasswordPolicyWithEnvironments[]> {
		const policies = await this.list();
		const assignments = await this.db
			.prepare("SELECT policy_id as policyId, environment_id as environmentId FROM password_policy_environments")
			.all<{ policyId: string; environmentId: string }>();
		const byPolicy = new Map<string, string[]>();
		for (const row of assignments.results ?? []) {
			const list = byPolicy.get(row.policyId) ?? [];
			list.push(row.environmentId);
			byPolicy.set(row.policyId, list);
		}
		return policies.map((policy) => ({
			...policy,
			environmentIds: byPolicy.get(policy.id) ?? [],
		}));
	}

	async getById(id: string): Promise<PasswordPolicy | null> {
		const row = await this.db
			.prepare(`SELECT ${selectColumns()} FROM password_policies WHERE id = ?`)
			.bind(id)
			.first<PolicyRow>();
		return row ? mapRow(row) : null;
	}

	async getWithEnvironments(id: string): Promise<PasswordPolicyWithEnvironments | null> {
		const policy = await this.getById(id);
		if (!policy) return null;
		const assignments = await this.db
			.prepare("SELECT environment_id as environmentId FROM password_policy_environments WHERE policy_id = ?")
			.bind(id)
			.all<{ environmentId: string }>();
		return {
			...policy,
			environmentIds: (assignments.results ?? []).map((row) => row.environmentId),
		};
	}

	async create(id: string, input: CreatePasswordPolicyInput, now: string): Promise<void> {
		await this.db
			.prepare(
				`INSERT INTO password_policies (
					id, name, enabled, min_length, max_length, require_uppercase, require_lowercase,
					require_number, require_special, reject_contains_identifier, max_password_age_days,
					created_at, updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				id,
				input.name,
				input.enabled ? 1 : 0,
				input.minLength,
				input.maxLength,
				input.requireUppercase ? 1 : 0,
				input.requireLowercase ? 1 : 0,
				input.requireNumber ? 1 : 0,
				input.requireSpecial ? 1 : 0,
				input.rejectContainsIdentifier ? 1 : 0,
				input.maxPasswordAgeDays,
				now,
				now
			)
			.run();
	}

	async update(id: string, updates: UpdatePasswordPolicyInput, now: string): Promise<void> {
		const sets: string[] = [];
		const binds: Array<string | number | null> = [];
		const boolColumns: Array<[keyof UpdatePasswordPolicyInput, string]> = [
			["enabled", "enabled"],
			["requireUppercase", "require_uppercase"],
			["requireLowercase", "require_lowercase"],
			["requireNumber", "require_number"],
			["requireSpecial", "require_special"],
			["rejectContainsIdentifier", "reject_contains_identifier"],
		];
		if (updates.name !== undefined) {
			sets.push("name = ?");
			binds.push(updates.name);
		}
		if (updates.minLength !== undefined) {
			sets.push("min_length = ?");
			binds.push(updates.minLength);
		}
		if (updates.maxLength !== undefined) {
			sets.push("max_length = ?");
			binds.push(updates.maxLength);
		}
		if (updates.maxPasswordAgeDays !== undefined) {
			sets.push("max_password_age_days = ?");
			binds.push(updates.maxPasswordAgeDays);
		}
		for (const [key, column] of boolColumns) {
			if (updates[key] !== undefined) {
				sets.push(`${column} = ?`);
				binds.push(updates[key] ? 1 : 0);
			}
		}
		// Always bump updated_at on any update.
		sets.push("updated_at = ?");
		binds.push(now);

		binds.push(id);
		await this.db
			.prepare(`UPDATE password_policies SET ${sets.join(", ")} WHERE id = ?`)
			.bind(...binds)
			.run();
	}

	async delete(id: string): Promise<void> {
		// Assignments cascade via FK ON DELETE CASCADE.
		await this.db.prepare("DELETE FROM password_policies WHERE id = ?").bind(id).run();
	}

	async setEnvironments(policyId: string, environmentIds: string[]): Promise<void> {
		const statements = [
			this.db.prepare("DELETE FROM password_policy_environments WHERE policy_id = ?").bind(policyId),
			...environmentIds.map((environmentId) =>
				this.db
					.prepare(
						"INSERT INTO password_policy_environments (id, policy_id, environment_id) VALUES (?, ?, ?)"
					)
					.bind(crypto.randomUUID(), policyId, environmentId)
			),
		];
		await this.db.batch(statements);
	}

	async getPolicyForEnvironment(environmentId: string): Promise<PasswordPolicy | null> {
		const row = await this.db
			.prepare(
				`SELECT ${selectColumns("p")}
				FROM password_policies p
				JOIN password_policy_environments e ON e.policy_id = p.id
				WHERE e.environment_id = ?`
			)
			.bind(environmentId)
			.first<PolicyRow>();
		return row ? mapRow(row) : null;
	}

	async getStrictestEnabledMaxAgeDaysForUser(userId: string): Promise<number | null> {
		const row = await this.db
			.prepare(
				`SELECT MIN(p.max_password_age_days) as value
				FROM users_environments ue
				JOIN password_policy_environments ppe ON ppe.environment_id = ue.environment_id
				JOIN password_policies p ON p.id = ppe.policy_id
				WHERE ue.user_id = ? AND p.enabled = 1 AND p.max_password_age_days > 0`
			)
			.bind(userId)
			.first<{ value: number | null }>();
		return row?.value ?? null;
	}
}
