import { useState } from "react";
import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import {
	Banner,
	Button,
	ConfirmDialog,
	EmptyState,
	IconButton,
	InlineDeleteConfirm,
	Select,
	SidePanel,
} from "@/components/ui";
import type { Environment } from "@/lib/repositories/environment.repository";
import type {
	CreatePasswordPolicyInput,
	PasswordPolicyWithEnvironments,
} from "@/lib/repositories/password-policy.repository";
import {
	draftFromPolicy,
	draftToInput,
	emptyDraft,
	isPolicyDraftDirty,
	summarize,
	type PolicyDraft,
} from "./policy-draft";
import { PolicyForm } from "./policy-form";
import type { SetupTabId } from "./state";

/** The form lives in the panel body; its submit button lives in the panel footer. */
const FORM_ID = "password-policy-form";

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
	const [panelOpen, setPanelOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [draft, setDraft] = useState<PolicyDraft>(emptyDraft);
	const [baseline, setBaseline] = useState<PolicyDraft>(emptyDraft);
	const [confirmingDiscard, setConfirmingDiscard] = useState(false);
	const [saving, setSaving] = useState(false);
	const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [savingAdminPolicy, setSavingAdminPolicy] = useState(false);

	const dirty = isPolicyDraftDirty(draft, baseline);

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

	const openCreate = () => {
		onClearError();
		setEditingId(null);
		setDraft(emptyDraft);
		setBaseline(emptyDraft);
		setPanelOpen(true);
	};

	const startEdit = (policy: PasswordPolicyWithEnvironments) => {
		onClearError();
		const next = draftFromPolicy(policy);
		setEditingId(policy.id);
		setDraft(next);
		setBaseline(next);
		setPanelOpen(true);
	};

	// Deliberately does not reset draft/editingId: the panel keeps rendering its
	// children while it animates out, so clearing them would slide out an empty
	// form. Every open path re-initialises both.
	const closePanel = () => {
		setConfirmingDiscard(false);
		setPanelOpen(false);
		// Drop any save error, so it cannot resurface in the section banner once
		// the panel stops suppressing it.
		onClearError();
	};

	const requestClose = () => {
		// The panel stays mounted (and its Escape handler live) for the length of
		// the exit animation, so without this a second Escape would re-open the
		// discard dialog over an already-closing panel.
		if (!panelOpen || saving) return;
		if (dirty) setConfirmingDiscard(true);
		else closePanel();
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setSaving(true);
		try {
			const input = draftToInput(draft);
			const ok = editingId
				? await onUpdate(editingId, input, draft.environmentIds)
				: await onCreate(input, draft.environmentIds);
			if (ok) closePanel();
		} finally {
			setSaving(false);
		}
	};

	const confirmDelete = async (id: string) => {
		setDeletingId(id);
		try {
			const ok = await onDelete(id);
			if (ok) setConfirmingDeleteId(null);
		} finally {
			setDeletingId(null);
		}
	};

	return (
		<section
			className={`mt-6 ${activeTab !== "password-policies" ? "hidden" : ""}`}
			role="tabpanel"
			id="setup-panel-password-policies"
			aria-labelledby="setup-tab-password-policies"
			aria-hidden={activeTab !== "password-policies"}
		>
			<div className="mb-4 flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<h2 className="mb-1 flex items-center gap-2 text-lg font-medium">
						<Lock className="h-5 w-5" />
						Password policies
					</h2>
					<p className="text-sm text-muted-foreground">
						Define complexity rules and a maximum password age, then assign each policy to one or
						more environments. An environment can hold at most one policy.
					</p>
				</div>
				<Button type="button" icon={Plus} onClick={openCreate}>
					New policy
				</Button>
			</div>

			{/* Save errors surface inside the panel; list and admin-policy errors here. */}
			<Banner variant="error" message={panelOpen ? null : error} />

			<div className="mb-6 rounded-card border border-border p-4">
				<label className="text-sm" htmlFor="admin-password-policy">
					<span className="mb-1 block font-medium">Admin sign-in policy</span>
					<span className="mb-2 block text-xs text-muted-foreground">
						Admins don&apos;t belong to an environment, so choose the policy that applies when an
						admin signs in. Leave as <span className="font-medium">None</span> to enforce no policy
						for admins.
					</span>
					<Select
						id="admin-password-policy"
						value={adminPasswordPolicyId ?? ""}
						disabled={savingAdminPolicy}
						onChange={(e) => handleAdminPolicyChange(e.target.value)}
						className="w-full max-w-sm"
					>
						<option value="">None</option>
						{policies.map((policy) => (
							<option key={policy.id} value={policy.id}>
								{policy.name}
								{!policy.enabled ? " (disabled)" : ""}
							</option>
						))}
					</Select>
				</label>
			</div>

			{policies.length === 0 ? (
				<EmptyState
					icon={Lock}
					title="No password policies yet"
					description="Create a policy to enforce password complexity and expiry, then assign it to an environment."
					action={
						<Button type="button" icon={Plus} onClick={openCreate}>
							New policy
						</Button>
					}
				/>
			) : (
				<ul className="divide-y divide-border overflow-hidden rounded-card border border-border">
					{policies.map((policy) => {
						const envNames = policy.environmentIds
							.map((id) => environments.find((env) => env.id === id)?.name)
							.filter((name): name is string => !!name)
							.sort((a, b) => a.localeCompare(b));
						return (
							<li key={policy.id} className="flex items-start justify-between gap-3 px-4 py-3">
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
											<IconButton
												type="button"
												aria-label={`Edit ${policy.name}`}
												title="Edit"
												onClick={() => startEdit(policy)}
											>
												<Pencil className="h-4 w-4" />
											</IconButton>
											<IconButton
												type="button"
												variant="danger"
												aria-label={`Delete ${policy.name}`}
												title="Delete"
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
				</ul>
			)}

			<SidePanel
				open={panelOpen}
				onRequestClose={requestClose}
				icon={Lock}
				title={editingId ? "Edit policy" : "New policy"}
				description={
					editingId
						? "Changes apply the next time a password is set or checked."
						: "Assign the policy to the environments it should govern."
				}
				footer={
					<div className="flex items-center gap-2">
						<Button type="submit" form={FORM_ID} icon={editingId ? Pencil : Plus} loading={saving}>
							{editingId ? "Save policy" : "Add policy"}
						</Button>
						<Button type="button" variant="secondary" onClick={requestClose} disabled={saving}>
							Cancel
						</Button>
					</div>
				}
			>
				<PolicyForm
					formId={FORM_ID}
					draft={draft}
					onChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
					environments={environments}
					envOwner={envOwner}
					editingId={editingId}
					error={error}
					onSubmit={handleSubmit}
				/>
			</SidePanel>

			<ConfirmDialog
				open={confirmingDiscard}
				title="Discard changes?"
				description="This policy has unsaved edits. Closing the panel will lose them."
				confirmLabel="Discard changes"
				cancelLabel="Keep editing"
				emphasis="cancel"
				onConfirm={closePanel}
				onCancel={() => setConfirmingDiscard(false)}
			/>
		</section>
	);
}
