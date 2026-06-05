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
	onClearError: () => void;
	onCreate: (input: CreatePasswordPolicyInput, environmentIds: string[]) => Promise<boolean>;
	onUpdate: (
		id: string,
		input: CreatePasswordPolicyInput,
		environmentIds: string[]
	) => Promise<boolean>;
	onDelete: (id: string) => Promise<boolean>;
}

interface PolicyDraft {
	name: string;
	enabled: boolean;
	minLength: string;
	maxLength: string;
	requireUppercase: boolean;
	requireLowercase: boolean;
	requireNumber: boolean;
	requireSpecial: boolean;
	rejectContainsIdentifier: boolean;
	maxPasswordAgeDays: string;
	environmentIds: string[];
}

const emptyDraft: PolicyDraft = {
	name: "",
	enabled: true,
	minLength: "8",
	maxLength: "",
	requireUppercase: false,
	requireLowercase: false,
	requireNumber: false,
	requireSpecial: false,
	rejectContainsIdentifier: false,
	maxPasswordAgeDays: "0",
	environmentIds: [],
};

function draftFromPolicy(policy: PasswordPolicyWithEnvironments): PolicyDraft {
	return {
		name: policy.name,
		enabled: policy.enabled,
		minLength: String(policy.minLength),
		maxLength: policy.maxLength === null ? "" : String(policy.maxLength),
		requireUppercase: policy.requireUppercase,
		requireLowercase: policy.requireLowercase,
		requireNumber: policy.requireNumber,
		requireSpecial: policy.requireSpecial,
		rejectContainsIdentifier: policy.rejectContainsIdentifier,
		maxPasswordAgeDays: String(policy.maxPasswordAgeDays),
		environmentIds: [...policy.environmentIds],
	};
}

function draftToInput(draft: PolicyDraft): CreatePasswordPolicyInput {
	const parsedMax = draft.maxLength.trim();
	return {
		name: draft.name.trim(),
		enabled: draft.enabled,
		minLength: Number.parseInt(draft.minLength, 10) || 0,
		maxLength: parsedMax === "" ? null : Number.parseInt(parsedMax, 10) || 0,
		requireUppercase: draft.requireUppercase,
		requireLowercase: draft.requireLowercase,
		requireNumber: draft.requireNumber,
		requireSpecial: draft.requireSpecial,
		rejectContainsIdentifier: draft.rejectContainsIdentifier,
		maxPasswordAgeDays: Number.parseInt(draft.maxPasswordAgeDays, 10) || 0,
	};
}

function summarize(policy: PasswordPolicyWithEnvironments): string {
	const parts = [`min ${policy.minLength}`];
	if (policy.maxLength !== null) parts.push(`max ${policy.maxLength}`);
	const classes = [
		policy.requireUppercase && "A-Z",
		policy.requireLowercase && "a-z",
		policy.requireNumber && "0-9",
		policy.requireSpecial && "symbol",
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
	onClearError,
	onCreate,
	onUpdate,
	onDelete,
}: PasswordPoliciesSectionProps) {
	const [draft, setDraft] = useState<PolicyDraft>(emptyDraft);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
	const [deletingId, setDeletingId] = useState<string | null>(null);

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
			className={`mt-6 rounded-xl border border-brand-muted p-6 ${activeTab !== "password-policies" ? "hidden" : ""}`}
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

			<form onSubmit={handleSubmit} className="mb-6 space-y-4 rounded-xl border border-brand-muted p-4">
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
							className="rounded border-brand-muted"
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

				<div className="flex flex-wrap gap-4">
					{(
						[
							["requireUppercase", "Uppercase"],
							["requireLowercase", "Lowercase"],
							["requireNumber", "Number"],
							["requireSpecial", "Special char"],
							["rejectContainsIdentifier", "No username/email"],
						] as const
					).map(([key, label]) => (
						<label key={key} className="flex items-center gap-2 text-sm">
							<input
								type="checkbox"
								checked={draft[key]}
								onChange={(e) => update({ [key]: e.target.checked } as Partial<PolicyDraft>)}
								className="rounded border-brand-muted"
							/>
							{label}
						</label>
					))}
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
											className="rounded border-brand-muted"
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
							className="flex items-start justify-between gap-3 rounded-xl border border-brand-muted px-3 py-2"
						>
							<div className="min-w-0">
								<div className="flex items-center gap-2">
									<span className="font-medium">{policy.name}</span>
									{!policy.enabled ? (
										<span className="rounded-full bg-brand-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
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
												className="rounded-full bg-brand-muted/40 px-2 py-0.5 text-xs text-muted-foreground"
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
