import { Banner, Input } from "@/components/ui";
import type { Environment } from "@/lib/repositories/environment.repository";
import { COUNT_FIELDS, type PolicyDraft } from "./policy-draft";

interface PolicyFormProps {
	/** Links the panel footer's submit button to this form via the `form` attribute. */
	formId: string;
	draft: PolicyDraft;
	onChange: (patch: Partial<PolicyDraft>) => void;
	environments: Environment[];
	/** Environment id → the policy that owns it, for the one-policy-per-env rule. */
	envOwner: Map<string, { id: string; name: string }>;
	editingId: string | null;
	/** Save errors render here rather than in the section, which sits behind the scrim. */
	error: string | null;
	onSubmit: (e: React.FormEvent) => void;
}

export function PolicyForm({
	formId,
	draft,
	onChange,
	environments,
	envOwner,
	editingId,
	error,
	onSubmit,
}: PolicyFormProps) {
	const toggleEnvironment = (envId: string) => {
		onChange({
			environmentIds: draft.environmentIds.includes(envId)
				? draft.environmentIds.filter((id) => id !== envId)
				: [...draft.environmentIds, envId],
		});
	};

	return (
		<form id={formId} onSubmit={onSubmit} className="space-y-4">
			<Banner variant="error" message={error} />

			<label className="block text-sm">
				<span className="mb-1 block text-muted-foreground">Name</span>
				<Input
					type="text"
					data-autofocus
					value={draft.name}
					onChange={(e) => onChange({ name: e.target.value })}
					placeholder="Policy name"
				/>
			</label>

			<label className="flex items-center gap-2 text-sm">
				<input
					type="checkbox"
					checked={draft.enabled}
					onChange={(e) => onChange({ enabled: e.target.checked })}
					className="rounded-chip border-border"
				/>
				Enabled
			</label>

			<div className="grid gap-4 sm:grid-cols-2">
				<label className="text-sm">
					<span className="mb-1 block text-muted-foreground">Min length</span>
					<Input
						type="number"
						min={1}
						value={draft.minLength}
						onChange={(e) => onChange({ minLength: e.target.value })}
					/>
				</label>
				<label className="text-sm">
					<span className="mb-1 block text-muted-foreground">Max length (optional)</span>
					<Input
						type="number"
						min={1}
						value={draft.maxLength}
						onChange={(e) => onChange({ maxLength: e.target.value })}
						placeholder="No max"
					/>
				</label>
			</div>

			<label className="block text-sm">
				<span className="mb-1 block text-muted-foreground">Max age in days (0 = none)</span>
				<Input
					type="number"
					min={0}
					value={draft.maxPasswordAgeDays}
					onChange={(e) => onChange({ maxPasswordAgeDays: e.target.value })}
				/>
			</label>

			<div className="grid gap-4 sm:grid-cols-2">
				{COUNT_FIELDS.map(([key, label]) => (
					<label key={key} className="text-sm">
						<span className="mb-1 block text-muted-foreground">{label}</span>
						<Input
							type="number"
							min={0}
							value={draft[key] as string}
							onChange={(e) => onChange({ [key]: e.target.value } as Partial<PolicyDraft>)}
						/>
					</label>
				))}
			</div>

			<p className="text-xs text-muted-foreground">
				Each field is the minimum number of characters of that class a password must contain. Use{" "}
				<span className="font-medium">0</span> to not require any.
			</p>

			<label className="flex items-center gap-2 text-sm">
				<input
					type="checkbox"
					checked={draft.rejectContainsIdentifier}
					onChange={(e) => onChange({ rejectContainsIdentifier: e.target.checked })}
					className="rounded-chip border-border"
				/>
				No username/email
			</label>

			<div>
				<span className="mb-1 block text-sm text-muted-foreground">Environments</span>
				{environments.length === 0 ? (
					<p className="text-sm text-muted-foreground">No environments defined.</p>
				) : (
					<div className="flex flex-wrap gap-3">
						{environments.map((env) => {
							const owner = envOwner.get(env.id);
							const ownedByOther = !!owner && owner.id !== editingId;
							return (
								<label
									key={env.id}
									className={`flex items-center gap-2 text-sm ${ownedByOther ? "opacity-50" : "cursor-pointer"}`}
									title={ownedByOther ? `Already assigned to "${owner.name}"` : undefined}
								>
									<input
										type="checkbox"
										checked={draft.environmentIds.includes(env.id)}
										disabled={ownedByOther}
										onChange={() => toggleEnvironment(env.id)}
										className="rounded-chip border-border"
									/>
									<span>{env.name}</span>
									{ownedByOther ? (
										<span className="text-xs text-muted-foreground">(in {owner.name})</span>
									) : null}
								</label>
							);
						})}
					</div>
				)}
			</div>
		</form>
	);
}
