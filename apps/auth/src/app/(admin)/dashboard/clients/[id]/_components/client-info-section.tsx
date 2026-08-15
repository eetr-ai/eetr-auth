import type { FormEvent } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { Button, Card, Input, Label } from "@/components/ui";
import type { ClientWithDetails } from "@/lib/repositories/client.repository";
import type { Environment } from "@/lib/repositories/environment.repository";

interface ClientInfoSectionProps {
	client: ClientWithDetails;
	envById: Record<string, Environment>;
	name: string;
	onNameChange: (value: string) => void;
	savingName: boolean;
	onSaveName: (e: FormEvent) => void;
	rotating: boolean;
	onRotateSecret: () => void;
	onDelete: () => void;
}

export function ClientInfoSection({
	client,
	envById,
	name,
	onNameChange,
	savingName,
	onSaveName,
	rotating,
	onRotateSecret,
	onDelete,
}: ClientInfoSectionProps) {
	return (
		<Card>
			<h2 className="mb-3 text-lg font-medium">{client.name ? `${client.name}` : "Client details"}</h2>
			<div className="mb-3">
				<Label className="font-medium text-foreground">Name</Label>
				<form onSubmit={onSaveName} className="flex gap-2">
					<Input
						type="text"
						value={name}
						onChange={(e) => onNameChange(e.target.value)}
						placeholder="e.g. Production API"
						className="flex-1"
					/>
					<Button type="submit" disabled={savingName}>
						{savingName ? "Saving…" : "Save name"}
					</Button>
				</form>
			</div>
			<p className="mb-1 text-sm font-medium">Client ID</p>
			<code className="block rounded border border-border bg-background px-3 py-2 font-mono text-sm">
				{client.clientId}
			</code>
			<p className="mt-2 text-sm text-muted-foreground">
				Environment: {envById[client.environmentId]?.name ?? client.environmentId}
			</p>
			{client.expiresAt && (
				<p className="text-sm text-muted-foreground">
					Expires: {new Date(client.expiresAt).toLocaleString()}
				</p>
			)}
			<div className="mt-4 flex gap-2">
				<button
					type="button"
					onClick={onRotateSecret}
					disabled={rotating}
					className="flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm font-medium hover:bg-surface-hover disabled:opacity-50"
				>
					<RefreshCw className={`h-4 w-4 ${rotating ? "animate-spin" : ""}`} />
					Rotate secret
				</button>
				<button
					type="button"
					onClick={onDelete}
					className="flex items-center gap-2 rounded-full border border-danger-border px-3 py-2 text-sm font-medium text-danger-fg hover:bg-danger-bg"
				>
					<Trash2 className="h-4 w-4" />
					Delete client
				</button>
			</div>
		</Card>
	);
}
