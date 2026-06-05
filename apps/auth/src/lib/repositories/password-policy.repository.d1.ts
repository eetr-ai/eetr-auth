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
	minUppercase: number;
	minLowercase: number;
	minNumber: number;
	minSpecial: number;
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
	["min_uppercase", "minUppercase"],
	["min_lowercase", "minLowercase"],
	["min_number", "minNumber"],
	["min_special", "minSpecial"],
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
		minUppercase: row.minUppercase,
		minLowercase: row.minLowercase,
		minNumber: row.minNumber,
		minSpecial: row.minSpecial,
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
					id, name, enabled, min_length, max_length, min_uppercase, min_lowercase,
					min_number, min_special, reject_contains_identifier, max_password_age_days,
					created_at, updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				id,
				input.name,
				input.enabled ? 1 : 0,
				input.minLength,
				input.maxLength,
				input.minUppercase,
				input.minLowercase,
				input.minNumber,
				input.minSpecial,
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
			["rejectContainsIdentifier", "reject_contains_identifier"],
		];
		const numberColumns: Array<[keyof UpdatePasswordPolicyInput, string]> = [
			["minLength", "min_length"],
			["minUppercase", "min_uppercase"],
			["minLowercase", "min_lowercase"],
			["minNumber", "min_number"],
			["minSpecial", "min_special"],
			["maxPasswordAgeDays", "max_password_age_days"],
		];
		if (updates.name !== undefined) {
			sets.push("name = ?");
			binds.push(updates.name);
		}
		if (updates.maxLength !== undefined) {
			sets.push("max_length = ?");
			binds.push(updates.maxLength);
		}
		for (const [key, column] of numberColumns) {
			if (updates[key] !== undefined) {
				sets.push(`${column} = ?`);
				binds.push(updates[key] as number);
			}
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

	async getAdminPolicy(): Promise<PasswordPolicy | null> {
		const row = await this.db
			.prepare(
				`SELECT ${selectColumns("p")}
				FROM password_policies p
				JOIN site_settings s ON s.admin_password_policy_id = p.id
				WHERE s.id = 'default'`
			)
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
