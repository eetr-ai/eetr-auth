import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Banner, Button, IconButton, InlineDeleteConfirm, Input } from "@/components/ui";
import type { Environment } from "@/lib/repositories/environment.repository";
import type {
	CreatePasswordPolicyInput,
	PasswordPolicyWithEnvironments,
} from "@/lib/repositories/password-policy.repository";
import type { SetupTabId } from "./state";

interface PasswordPoliciesSectionProps {
	activeTab: SetupTabId;
	policies: PasswordPolicyWithEnvironments[];
	environments: Environment[];
	error: string | null;
	/** Policy applied to admin sign-in (admins have no environment), or null for none. */
	adminPasswordPolicyId: string | null;
	onClearError: () => void;
	onCreate: (input: CreatePasswordPolicyInput, environmentIds: string[]) => Promise<boolean>;
	onUpdate: (
		id: string,
		input: CreatePasswordPolicyInput,
		environmentIds: string[]
	) => Promise<boolean>;
	onDelete: (id: string) => Promise<boolean>;
	/** Persist the admin sign-in policy selection. Returns whether the save succeeded. */
	onSetAdminPolicy: (policyId: string | null) => Promise<boolean>;
}

interface PolicyDraft {
	name: string;
	enabled: boolean;
	minLength: string;
	maxLength: string;
	minUppercase: string;
	minLowercase: string;
	minNumber: string;
	minSpecial: string;
	rejectContainsIdentifier: boolean;
	maxPasswordAgeDays: string;
	environmentIds: string[];
}

const emptyDraft: PolicyDraft = {
	name: "",
	enabled: true,
	minLength: "8",
	maxLength: "",
	minUppercase: "0",
	minLowercase: "0",
	minNumber: "0",
	minSpecial: "0",
	rejectContainsIdentifier: false,
	maxPasswordAgeDays: "0",
	environmentIds: [],
};

// Minimum-count fields rendered as number inputs: [draft key, label].
const COUNT_FIELDS: Array<[keyof PolicyDraft, string]> = [
	["minUppercase", "Min uppercase"],
	["minLowercase", "Min lowercase"],
	["minNumber", "Min numbers"],
	["minSpecial", "Min special chars"],
];

function draftFromPolicy(policy: PasswordPolicyWithEnvironments): PolicyDraft {
	return {
		name: policy.name,
		enabled: policy.enabled,
		minLength: String(policy.minLength),
		maxLength: policy.maxLength === null ? "" : String(policy.maxLength),
		minUppercase: String(policy.minUppercase),
		minLowercase: String(policy.minLowercase),
		minNumber: String(policy.minNumber),
		minSpecial: String(policy.minSpecial),
		rejectContainsIdentifier: policy.rejectContainsIdentifier,
		maxPasswordAgeDays: String(policy.maxPasswordAgeDays),
		environmentIds: [...policy.environmentIds],
	};
}

function draftToInput(draft: PolicyDraft): CreatePasswordPolicyInput {
	const parsedMax = draft.maxLength.trim();
	const count = (value: string) => Math.max(0, Number.parseInt(value, 10) || 0);
	return {
		name: draft.name.trim(),
		enabled: draft.enabled,
		minLength: Number.parseInt(draft.minLength, 10) || 0,
		maxLength: parsedMax === "" ? null : Number.parseInt(parsedMax, 10) || 0,
		minUppercase: count(draft.minUppercase),
		minLowercase: count(draft.minLowercase),
		minNumber: count(draft.minNumber),
		minSpecial: count(draft.minSpecial),
		rejectContainsIdentifier: draft.rejectContainsIdentifier,
		maxPasswordAgeDays: Number.parseInt(draft.maxPasswordAgeDays, 10) || 0,
	};
}

function summarize(policy: PasswordPolicyWithEnvironments): string {
	const parts = [`min ${policy.minLength}`];
	if (policy.maxLength !== null) parts.push(`max ${policy.maxLength}`);
	const classes = [
		policy.minUppercase > 0 && `${policy.minUppercase}×A-Z`,
		policy.minLowercase > 0 && `${policy.minLowercase}×a-z`,
		policy.minNumber > 0 && `${policy.minNumber}×0-9`,
		policy.minSpecial > 0 && `${policy.minSpecial}×symbol`,
	].filter(Boolean);
	if (classes.length) parts.push(classes.join("/"));
	if (policy.rejectContainsIdentifier) parts.push("no identifier");
	parts.push(policy.maxPasswordAgeDays > 0 ? `expires ${policy.maxPasswordAgeDays}d` : "no expiry");
	return parts.join(" · ");
}

export function PasswordPoliciesSection({
	activeTab,
	policies,
	environments,
	error,
	adminPasswordPolicyId,
	onClearError,
	onCreate,
	onUpdate,
	onDelete,
	onSetAdminPolicy,
}: PasswordPoliciesSectionProps) {
	const [draft, setDraft] = useState<PolicyDraft>(emptyDraft);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [savingAdminPolicy, setSavingAdminPolicy] = useState(false);

	const handleAdminPolicyChange = async (value: string) => {
		onClearError();
		setSavingAdminPolicy(true);
		try {
			await onSetAdminPolicy(value === "" ? null : value);
		} finally {
			setSavingAdminPolicy(false);
		}
	};

	// Map each assigned environment to its owning policy, to enforce "one policy per
	// environment" in the UI (envs owned by another policy are shown disabled).
	const envOwner = new Map<string, { id: string; name: string }>();
	for (const policy of policies) {
		for (const envId of policy.environmentIds) {
			envOwner.set(envId, { id: policy.id, name: policy.name });
		}
	}

	const update = (patch: Partial<PolicyDraft>) => setDraft((prev) => ({ ...prev, ...patch }));

	const resetForm = () => {
		setDraft(emptyDraft);
		setEditingId(null);
	};

	const startEdit = (policy: PasswordPolicyWithEnvironments) => {
		onClearError();
		setEditingId(policy.id);
		setDraft(draftFromPolicy(policy));
	};

	const toggleEnvironment = (envId: string) => {
		update({
			environmentIds: draft.environmentIds.includes(envId)
				? draft.environmentIds.filter((id) => id !== envId)
				: [...draft.environmentIds, envId],
		});
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setSaving(true);
		try {
			const input = draftToInput(draft);
			const ok = editingId
				? await onUpdate(editingId, input, draft.environmentIds)
				: await onCreate(input, draft.environmentIds);
			if (ok) resetForm();
		} finally {
			setSaving(false);
		}
	};

	const confirmDelete = async (id: string) => {
		setDeletingId(id);
		try {
			const ok = await onDelete(id);
			if (ok) {
				setConfirmingDeleteId(null);
				if (editingId === id) resetForm();
			}
		} finally {
			setDeletingId(null);
		}
	};

	return (
		<section
			className={`mt-6 rounded-card border border-border p-6 ${activeTab !== "password-policies" ? "hidden" : ""}`}
			role="tabpanel"
			id="setup-panel-password-policies"
			aria-labelledby="setup-tab-password-policies"
			aria-hidden={activeTab !== "password-policies"}
		>
			<h2 className="mb-1 text-lg font-medium">Password policies</h2>
			<p className="mb-4 text-sm text-muted-foreground">
				Define complexity rules and a maximum password age, then assign each policy to one or
				more environments. An environment can hold at most one policy.
			</p>
			<Banner variant="error" message={error} />

			<div className="mb-6 rounded-card border border-border p-4">
				<label className="text-sm" htmlFor="admin-password-policy">
					<span className="mb-1 block font-medium">Admin sign-in policy</span>
					<span className="mb-2 block text-xs text-muted-foreground">
						Admins don&apos;t belong to an environment, so choose the policy that applies when an
						admin signs in. Leave as <span className="font-medium">None</span> to enforce no policy
						for admins.
					</span>
					<select
						id="admin-password-policy"
						value={adminPasswordPolicyId ?? ""}
						disabled={savingAdminPolicy}
						onChange={(e) => handleAdminPolicyChange(e.target.value)}
						className="w-full max-w-sm rounded-card border border-border bg-background px-3 py-2 text-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50"
					>
						<option value="">None</option>
						{policies.map((policy) => (
							<option key={policy.id} value={policy.id}>
								{policy.name}
								{!policy.enabled ? " (disabled)" : ""}
							</option>
						))}
					</select>
				</label>
			</div>

			<form onSubmit={handleSubmit} className="mb-6 space-y-4 rounded-card border border-border p-4">
				<div className="flex flex-wrap items-center gap-3">
					<Input
						type="text"
						value={draft.name}
						onChange={(e) => update({ name: e.target.value })}
						placeholder="Policy name"
						className="flex-1"
					/>
					<label className="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={draft.enabled}
							onChange={(e) => update({ enabled: e.target.checked })}
							className="rounded border-border"
						/>
						Enabled
					</label>
				</div>

				<div className="grid gap-4 sm:grid-cols-3">
					<label className="text-sm">
						<span className="mb-1 block text-muted-foreground">Min length</span>
						<Input
							type="number"
							min={1}
							value={draft.minLength}
							onChange={(e) => update({ minLength: e.target.value })}
						/>
					</label>
					<label className="text-sm">
						<span className="mb-1 block text-muted-foreground">Max length (optional)</span>
						<Input
							type="number"
							min={1}
							value={draft.maxLength}
							onChange={(e) => update({ maxLength: e.target.value })}
							placeholder="No max"
						/>
					</label>
					<label className="text-sm">
						<span className="mb-1 block text-muted-foreground">Max age in days (0 = none)</span>
						<Input
							type="number"
							min={0}
							value={draft.maxPasswordAgeDays}
							onChange={(e) => update({ maxPasswordAgeDays: e.target.value })}
						/>
					</label>
				</div>

				<div className="grid gap-4 sm:grid-cols-4">
					{COUNT_FIELDS.map(([key, label]) => (
						<label key={key} className="text-sm">
							<span className="mb-1 block text-muted-foreground">{label}</span>
							<Input
								type="number"
								min={0}
								value={draft[key] as string}
								onChange={(e) => update({ [key]: e.target.value } as Partial<PolicyDraft>)}
							/>
						</label>
					))}
				</div>

				<p className="text-xs text-muted-foreground">
					Each field is the minimum number of characters of that class a password must contain.
					Use <span className="font-medium">0</span> to not require any.
				</p>

				<div className="flex flex-wrap gap-4">
					<label className="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={draft.rejectContainsIdentifier}
							onChange={(e) => update({ rejectContainsIdentifier: e.target.checked })}
							className="rounded border-border"
						/>
						No username/email
					</label>
				</div>

				<div>
					<span className="mb-1 block text-sm text-muted-foreground">Environments</span>
					{environments.length === 0 ? (
						<p className="text-sm text-muted-foreground">No environments defined.</p>
					) : (
						<div className="flex flex-wrap gap-3">
							{environments.map((env) => {
								const owner = envOwner.get(env.id);
								const ownedByOther = !!owner && owner.id !== editingId;
								const checked = draft.environmentIds.includes(env.id);
								return (
									<label
										key={env.id}
										className={`flex items-center gap-2 text-sm ${ownedByOther ? "opacity-50" : "cursor-pointer"}`}
										title={ownedByOther ? `Already assigned to "${owner!.name}"` : undefined}
									>
										<input
											type="checkbox"
											checked={checked}
											disabled={ownedByOther}
											onChange={() => toggleEnvironment(env.id)}
											className="rounded border-border"
										/>
										<span>{env.name}</span>
										{ownedByOther ? (
											<span className="text-xs text-muted-foreground">(in {owner!.name})</span>
										) : null}
									</label>
								);
							})}
						</div>
					)}
				</div>

				<div className="flex items-center gap-2">
					<Button type="submit" icon={editingId ? Pencil : Plus} loading={saving}>
						{editingId ? "Save policy" : "Add policy"}
					</Button>
					{editingId ? (
						<Button type="button" variant="secondary" onClick={resetForm} disabled={saving}>
							Cancel
						</Button>
					) : null}
				</div>
			</form>

			<ul className="space-y-2">
				{policies.map((policy) => {
					const envNames = policy.environmentIds
						.map((id) => environments.find((env) => env.id === id)?.name)
						.filter((name): name is string => !!name)
						.sort((a, b) => a.localeCompare(b));
					return (
						<li
							key={policy.id}
							className="flex items-start justify-between gap-3 rounded-card border border-border px-3 py-2"
						>
							<div className="min-w-0">
								<div className="flex items-center gap-2">
									<span className="font-medium">{policy.name}</span>
									{!policy.enabled ? (
										<span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs text-muted-foreground">
											Disabled
										</span>
									) : null}
								</div>
								<p className="text-xs text-muted-foreground">{summarize(policy)}</p>
								<div className="mt-1 flex flex-wrap gap-1">
									{envNames.length === 0 ? (
										<span className="text-xs text-muted-foreground">No environments</span>
									) : (
										envNames.map((name) => (
											<span
												key={name}
												className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs text-muted-foreground"
											>
												{name}
											</span>
										))
									)}
								</div>
							</div>
							<div className="flex shrink-0 items-center gap-2">
								{confirmingDeleteId === policy.id ? (
									<InlineDeleteConfirm
										label={`Delete "${policy.name}"?`}
										busy={deletingId === policy.id}
										onConfirm={() => confirmDelete(policy.id)}
										onCancel={() => setConfirmingDeleteId(null)}
									/>
								) : (
									<>
										<IconButton type="button" aria-label="Edit policy" onClick={() => startEdit(policy)}>
											<Pencil className="h-4 w-4" />
										</IconButton>
										<IconButton
											type="button"
											variant="danger"
											aria-label="Delete policy"
											onClick={() => {
												onClearError();
												setConfirmingDeleteId(policy.id);
											}}
										>
											<Trash2 className="h-4 w-4" />
										</IconButton>
									</>
								)}
							</div>
						</li>
					);
				})}
				{policies.length === 0 && (
					<li className="py-2 text-sm text-muted-foreground">No password policies yet. Add one above.</li>
				)}
			</ul>
		</section>
	);
}
