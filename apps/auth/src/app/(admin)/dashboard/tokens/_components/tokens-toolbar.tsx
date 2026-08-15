import { Loader2, Eraser } from "lucide-react";
import { InlineDeleteConfirm, Select } from "@/components/ui";
import type { Environment } from "@/lib/repositories/environment.repository";

interface TokensToolbarProps {
	environments: Environment[];
	environmentFilter: string;
	onEnvironmentFilterChange: (value: string) => void;
	/** [clientId, label] pairs for the clients present in the current activity list. */
	clientOptions: Array<[string, string]>;
	clientFilter: string;
	onClientFilterChange: (value: string) => void;
	cleanupRunning: boolean;
	cleanupMessage: string | null;
	/** Cleanup deletes in bulk, so it confirms inline before running. */
	confirmingCleanup: boolean;
	onRequestCleanup: () => void;
	onCancelCleanup: () => void;
	onRunCleanup: () => void;
}

export function TokensToolbar({
	environments,
	environmentFilter,
	onEnvironmentFilterChange,
	clientOptions,
	clientFilter,
	onClientFilterChange,
	cleanupRunning,
	cleanupMessage,
	confirmingCleanup,
	onRequestCleanup,
	onCancelCleanup,
	onRunCleanup,
}: TokensToolbarProps) {
	// A deep link can name a client that has no tokens. Without an option to
	// match, the select would fall back to "All" and silently drop the filter.
	const clientFilterHasOption = clientOptions.some(([id]) => id === clientFilter);

	return (
		<div className="mb-4 flex shrink-0 flex-wrap items-center gap-4">
			<div className="flex items-center gap-2">
				<label className="text-sm font-medium" htmlFor="token-env-filter">
					Filter by environment
				</label>
				<Select
					id="token-env-filter"
					value={environmentFilter}
					onChange={(event) => onEnvironmentFilterChange(event.target.value)}
				>
					<option value="">All</option>
					{environments.map((environment) => (
						<option key={environment.id} value={environment.id}>
							{environment.name}
						</option>
					))}
				</Select>
			</div>

			<div className="flex items-center gap-2">
				<label className="text-sm font-medium" htmlFor="token-client-filter">
					Client
				</label>
				<Select
					id="token-client-filter"
					value={clientFilter}
					onChange={(event) => onClientFilterChange(event.target.value)}
				>
					<option value="">All</option>
					{clientFilter && !clientFilterHasOption ? (
						<option value={clientFilter}>{clientFilter} (no tokens)</option>
					) : null}
					{clientOptions.map(([id, label]) => (
						<option key={id} value={id}>
							{label}
						</option>
					))}
				</Select>
			</div>

			{confirmingCleanup ? (
				<InlineDeleteConfirm
					label="Delete expired tokens and used codes?"
					confirmLabel="Run cleanup"
					busy={cleanupRunning}
					onConfirm={onRunCleanup}
					onCancel={onCancelCleanup}
				/>
			) : (
				<button
					type="button"
					onClick={onRequestCleanup}
					disabled={cleanupRunning}
					className="flex items-center gap-2 rounded-control border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-surface-hover disabled:opacity-50"
				>
					{cleanupRunning ? (
						<Loader2 className="h-4 w-4 animate-spin" />
					) : (
						<Eraser className="h-4 w-4" />
					)}
					{cleanupRunning ? "Cleaning up…" : "Run cleanup"}
				</button>
			)}
			{cleanupMessage && <span className="text-sm text-muted-foreground">{cleanupMessage}</span>}
		</div>
	);
}
