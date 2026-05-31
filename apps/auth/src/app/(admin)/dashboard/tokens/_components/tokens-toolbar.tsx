import { Loader2, Eraser } from "lucide-react";
import type { Environment } from "@/lib/repositories/environment.repository";

interface TokensToolbarProps {
	environments: Environment[];
	environmentFilter: string;
	onEnvironmentFilterChange: (value: string) => void;
	cleanupRunning: boolean;
	cleanupMessage: string | null;
	onRunCleanup: () => void;
}

export function TokensToolbar({
	environments,
	environmentFilter,
	onEnvironmentFilterChange,
	cleanupRunning,
	cleanupMessage,
	onRunCleanup,
}: TokensToolbarProps) {
	return (
		<div className="mb-4 flex shrink-0 flex-wrap items-center gap-4">
			<div className="flex items-center gap-2">
				<label className="text-sm font-medium">Filter by environment</label>
				<select
					value={environmentFilter}
					onChange={(event) => onEnvironmentFilterChange(event.target.value)}
					className="rounded-xl border border-brand-muted bg-background px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
				>
					<option value="">All</option>
					{environments.map((environment) => (
						<option key={environment.id} value={environment.id}>
							{environment.name}
						</option>
					))}
				</select>
			</div>
			<button
				type="button"
				onClick={onRunCleanup}
				disabled={cleanupRunning}
				className="flex items-center gap-2 rounded-xl border border-brand-muted bg-background px-3 py-1.5 text-sm font-medium hover:bg-brand-muted/30 disabled:opacity-50"
			>
				{cleanupRunning ? (
					<Loader2 className="h-4 w-4 animate-spin" />
				) : (
					<Eraser className="h-4 w-4" />
				)}
				{cleanupRunning ? "Cleaning up…" : "Run cleanup"}
			</button>
			{cleanupMessage && <span className="text-sm text-muted-foreground">{cleanupMessage}</span>}
		</div>
	);
}
