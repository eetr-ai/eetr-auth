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

const fieldInputClass =
	"rounded-lg border border-border bg-background px-2 py-1.5 text-sm";
const fieldLabelClass = "mb-1 block text-xs text-muted-foreground";

export function AuditLogFilters({ filters, onChange }: AuditLogFiltersProps) {
	const set = (patch: Partial<AuditLogFilterValues>) => onChange({ ...filters, ...patch });

	return (
		<div className="mb-4 flex shrink-0 flex-wrap items-end gap-4 rounded-card border border-border bg-surface-sunken p-4">
			<div>
				<label className={fieldLabelClass}>Action contains</label>
				<input
					type="text"
					value={filters.action}
					placeholder="user.delete"
					onChange={(e) => set({ action: e.target.value })}
					className={fieldInputClass}
				/>
			</div>
			<div>
				<label className={fieldLabelClass}>Resource type</label>
				<input
					type="text"
					value={filters.resourceType}
					placeholder="user"
					onChange={(e) => set({ resourceType: e.target.value })}
					className={fieldInputClass}
				/>
			</div>
			<div>
				<label className={fieldLabelClass}>Resource id</label>
				<input
					type="text"
					value={filters.resourceId}
					onChange={(e) => set({ resourceId: e.target.value })}
					className={fieldInputClass}
				/>
			</div>
			<div>
				<label className={fieldLabelClass}>Actor user id</label>
				<input
					type="text"
					value={filters.actorUserId}
					onChange={(e) => set({ actorUserId: e.target.value })}
					className={fieldInputClass}
				/>
			</div>
			<div>
				<label className={fieldLabelClass}>From (date)</label>
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
				<label className={fieldLabelClass}>To (date)</label>
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
