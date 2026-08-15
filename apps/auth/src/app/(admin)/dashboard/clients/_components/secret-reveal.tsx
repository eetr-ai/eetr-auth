import { useState } from "react";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { Banner } from "@/components/ui";

interface SecretRevealProps {
	clientId: string;
	clientSecret: string;
	reason: "created" | "rotated";
}

/**
 * The one and only time a client secret is displayed.
 *
 * Rendered inside the side panel and paired with a "Done" footer that is the
 * only way out — the panel's normal dismissals (scrim, Escape, the X) are
 * suppressed while this is up, so a stray click cannot discard a secret the
 * admin has not copied.
 */
export function SecretReveal({ clientId, clientSecret, reason }: SecretRevealProps) {
	const [copied, setCopied] = useState<"id" | "secret" | null>(null);
	const [copyError, setCopyError] = useState<string | null>(null);

	const copy = async (value: string, which: "id" | "secret") => {
		// The clipboard API rejects on an insecure origin or a denied permission.
		// Failing silently here is worse than usual: the admin would dismiss the
		// panel believing they had copied a secret that cannot be shown again.
		try {
			await navigator.clipboard.writeText(value);
			setCopyError(null);
			setCopied(which);
			setTimeout(() => setCopied(null), 2000);
		} catch {
			setCopied(null);
			setCopyError("Could not copy to the clipboard — select the value and copy it manually.");
		}
	};

	return (
		<div className="space-y-4">
			<Banner
				variant="warning"
				message={
					<span className="flex items-start gap-2">
						<TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
						<span>
							{reason === "created" ? "Client created." : "Secret rotated."} Copy the secret now —
							it is not stored in a readable form and cannot be shown again.
						</span>
					</span>
				}
			/>

			<Banner variant="error" message={copyError} />

			<Field
				label="Client ID"
				value={clientId}
				copied={copied === "id"}
				onCopy={() => copy(clientId, "id")}
			/>
			<Field
				label="Client secret"
				value={clientSecret}
				copied={copied === "secret"}
				onCopy={() => copy(clientSecret, "secret")}
			/>
		</div>
	);
}

interface FieldProps {
	label: string;
	value: string;
	copied: boolean;
	onCopy: () => void;
}

function Field({ label, value, copied, onCopy }: FieldProps) {
	return (
		<div>
			<span className="mb-1 block text-sm text-muted-foreground">{label}</span>
			<div className="flex items-center gap-2">
				<code className="min-w-0 flex-1 truncate rounded-control border border-border bg-surface-sunken px-3 py-2 font-mono text-xs">
					{value}
				</code>
				<button
					type="button"
					onClick={onCopy}
					className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs hover:bg-surface-hover"
				>
					{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
					{copied ? "Copied" : "Copy"}
				</button>
			</div>
		</div>
	);
}
