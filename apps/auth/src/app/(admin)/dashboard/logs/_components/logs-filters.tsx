import type { Environment } from "@/lib/repositories/environment.repository";
import type { TokenActivityRequestType } from "@/lib/repositories/token-activity-log.repository";
import { environmentLabel } from "@/lib/repositories/environment.repository";

const REQUEST_TYPES: { value: TokenActivityRequestType; label: string }[] = [
	{ value: "authorize", label: "Authorize" },
	{ value: "token", label: "Token" },
	{ value: "validate", label: "Validate" },
	{ value: "cleanup", label: "Cleanup" },
	{ value: "admin_api", label: "Admin API" },
	{ value: "api_key", label: "API key" },
];

export interface LogsFiltersState {
	requestType: TokenActivityRequestType | "";
	environmentName: string;
	succeeded: "" | "yes" | "no";
	sinceIso: string;
	untilIso: string;
}

interface LogsFiltersProps {
	filters: LogsFiltersState;
	environments: Environment[];
	onChange: (updater: (f: LogsFiltersState) => LogsFiltersState) => void;
	onApply: () => void;
}

const selectClass = "rounded-lg border border-border bg-background px-2 py-1.5 text-sm";
const inputClass = "rounded-lg border border-border bg-background px-2 py-1.5 text-sm";
const labelClass = "mb-1 block text-xs text-muted-foreground";

export function LogsFilters({ filters, environments, onChange, onApply }: LogsFiltersProps) {
	return (
		<div className="mb-4 flex shrink-0 flex-wrap items-end gap-4 rounded-card border border-border bg-surface-sunken p-4">
			<div>
				<label className={labelClass}>Request type</label>
				<select
					value={filters.requestType}
					onChange={(e) => {
						onChange((f) => ({
							...f,
							requestType: e.target.value as TokenActivityRequestType | "",
						}));
						onApply();
					}}
					className={selectClass}
				>
					<option value="">All</option>
					{REQUEST_TYPES.map((t) => (
						<option key={t.value} value={t.value}>
							{t.label}
						</option>
					))}
				</select>
			</div>
			<div>
				<label className={labelClass}>Environment</label>
				<select
					value={filters.environmentName}
					onChange={(e) => {
						onChange((f) => ({ ...f, environmentName: e.target.value }));
						onApply();
					}}
					className={selectClass}
				>
					<option value="">All</option>
					{environments.map((env) => (
						// The VALUE must stay env.name: token_activity_log stores the environment
						// name, not its id, so that is what the query filters on. Only the label
						// is humanized.
						<option key={env.id} value={env.name}>
							{environmentLabel(env)}
						</option>
					))}
				</select>
			</div>
			<div>
				<label className={labelClass}>Success</label>
				<select
					value={filters.succeeded}
					onChange={(e) => {
						onChange((f) => ({
							...f,
							succeeded: e.target.value as "" | "yes" | "no",
						}));
						onApply();
					}}
					className={selectClass}
				>
					<option value="">All</option>
					<option value="yes">Yes</option>
					<option value="no">No</option>
				</select>
			</div>
			<div>
				<label className={labelClass}>From (date)</label>
				<input
					type="date"
					value={filters.sinceIso ? filters.sinceIso.slice(0, 10) : ""}
					onChange={(e) => {
						onChange((f) => ({
							...f,
							sinceIso: e.target.value ? `${e.target.value}T00:00:00.000Z` : "",
						}));
						onApply();
					}}
					className={inputClass}
				/>
			</div>
			<div>
				<label className={labelClass}>To (date)</label>
				<input
					type="date"
					value={filters.untilIso ? filters.untilIso.slice(0, 10) : ""}
					onChange={(e) => {
						onChange((f) => ({
							...f,
							untilIso: e.target.value ? `${e.target.value}T23:59:59.999Z` : "",
						}));
						onApply();
					}}
					className={inputClass}
				/>
			</div>
			<button
				type="button"
				onClick={onApply}
				className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-surface-hover"
			>
				Apply filters
			</button>
		</div>
	);
}
