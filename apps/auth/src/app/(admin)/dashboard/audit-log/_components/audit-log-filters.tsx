import { Label } from "@/components/ui";
export interface AuditLogFilterValues {
	action: string;
	resourceType: string;
	resourceId: string;
	actorUserId: string;
	sinceIso: string;
	untilIso: string;
}

interface AuditLogFiltersProps {
	filters: AuditLogFilterValues;
	onChange: (next: AuditLogFilterValues) => void;
}

// Compact toolbar inputs: sized for the filter row, but sharing Input's placeholder role.
const fieldInputClass =
	"rounded-lg border border-border bg-background px-2 py-1.5 text-sm placeholder:text-placeholder";

export function AuditLogFilters({ filters, onChange }: AuditLogFiltersProps) {
	const set = (patch: Partial<AuditLogFilterValues>) => onChange({ ...filters, ...patch });

	return (
		<div className="mb-4 flex shrink-0 flex-wrap items-end gap-4 rounded-card border border-border bg-surface-sunken p-4">
			<div>
				<Label variant="compact">Action contains</Label>
				<input
					type="text"
					value={filters.action}
					placeholder="e.g. user.delete"
					onChange={(e) => set({ action: e.target.value })}
					className={fieldInputClass}
				/>
			</div>
			<div>
				<Label variant="compact">Resource type</Label>
				<input
					type="text"
					value={filters.resourceType}
					placeholder="e.g. user"
					onChange={(e) => set({ resourceType: e.target.value })}
					className={fieldInputClass}
				/>
			</div>
			<div>
				<Label variant="compact">Resource id</Label>
				<input
					type="text"
					value={filters.resourceId}
					onChange={(e) => set({ resourceId: e.target.value })}
					className={fieldInputClass}
				/>
			</div>
			<div>
				<Label variant="compact">Actor user id</Label>
				<input
					type="text"
					value={filters.actorUserId}
					onChange={(e) => set({ actorUserId: e.target.value })}
					className={fieldInputClass}
				/>
			</div>
			<div>
				<Label variant="compact">From (date)</Label>
				<input
					type="date"
					value={filters.sinceIso ? filters.sinceIso.slice(0, 10) : ""}
					onChange={(e) =>
						set({ sinceIso: e.target.value ? `${e.target.value}T00:00:00.000Z` : "" })
					}
					className={fieldInputClass}
				/>
			</div>
			<div>
				<Label variant="compact">To (date)</Label>
				<input
					type="date"
					value={filters.untilIso ? filters.untilIso.slice(0, 10) : ""}
					onChange={(e) =>
						set({ untilIso: e.target.value ? `${e.target.value}T23:59:59.999Z` : "" })
					}
					className={fieldInputClass}
				/>
			</div>
		</div>
	);
}
