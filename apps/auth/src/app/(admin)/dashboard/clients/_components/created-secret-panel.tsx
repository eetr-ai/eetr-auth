import { Copy, Check } from "lucide-react";

interface CreatedSecretPanelProps {
	clientId: string;
	clientSecret: string;
	copied: "id" | "secret" | null;
	onCopy: (text: string, which: "id" | "secret") => void;
	onDismiss: () => void;
}

export function CreatedSecretPanel({
	clientId,
	clientSecret,
	copied,
	onCopy,
	onDismiss,
}: CreatedSecretPanelProps) {
	return (
		<div className="mt-6 rounded-card border border-warning-border bg-warning-bg p-4">
			<p className="mb-2 text-sm font-medium text-warning-fg">
				Client created. Copy the credentials now — the secret will not be shown again.
			</p>
			<div className="space-y-2">
				<div className="flex items-center gap-2">
					<code className="flex-1 rounded border border-border bg-background px-2 py-1 text-sm">
						{clientId}
					</code>
					<button
						type="button"
						onClick={() => onCopy(clientId, "id")}
						className="rounded-full p-1.5 hover:bg-surface-hover"
						aria-label="Copy client ID"
					>
						{copied === "id" ? (
							<Check className="h-4 w-4 text-success-icon" />
						) : (
							<Copy className="h-4 w-4" />
						)}
					</button>
				</div>
				<div className="flex items-center gap-2">
					<code className="flex-1 rounded border border-border bg-background px-2 py-1 text-sm">
						{clientSecret}
					</code>
					<button
						type="button"
						onClick={() => onCopy(clientSecret, "secret")}
						className="rounded-full p-1.5 hover:bg-surface-hover"
						aria-label="Copy secret"
					>
						{copied === "secret" ? (
							<Check className="h-4 w-4 text-success-icon" />
						) : (
							<Copy className="h-4 w-4" />
						)}
					</button>
				</div>
			</div>
			<button
				type="button"
				onClick={onDismiss}
				className="mt-3 text-sm text-muted-foreground underline hover:text-foreground"
			>
				Dismiss
			</button>
		</div>
	);
}
