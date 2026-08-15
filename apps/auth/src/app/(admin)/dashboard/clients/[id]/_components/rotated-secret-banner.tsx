import { Check, Copy } from "lucide-react";
import { IconButton } from "@/components/ui";

interface RotatedSecretBannerProps {
	secret: string;
	copied: boolean;
	onCopy: () => void;
	onDismiss: () => void;
}

export function RotatedSecretBanner({ secret, copied, onCopy, onDismiss }: RotatedSecretBannerProps) {
	return (
		<div className="mb-6 rounded-card border border-warning-border bg-warning-bg p-4">
			<p className="mb-2 text-sm font-medium text-warning-fg">
				New client secret. Copy it now — it will not be shown again.
			</p>
			<div className="flex items-center gap-2">
				<code className="flex-1 rounded border border-border bg-background px-2 py-1 text-sm">
					{secret}
				</code>
				<IconButton type="button" onClick={onCopy} aria-label="Copy secret">
					{copied ? (
						<Check className="h-4 w-4 text-success-icon" />
					) : (
						<Copy className="h-4 w-4" />
					)}
				</IconButton>
			</div>
			<button
				type="button"
				onClick={onDismiss}
				className="mt-2 text-sm text-muted-foreground underline hover:text-foreground"
			>
				Dismiss
			</button>
		</div>
	);
}
