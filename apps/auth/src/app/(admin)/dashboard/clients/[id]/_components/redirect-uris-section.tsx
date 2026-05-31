import type { FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Card, IconButton, Input } from "@/components/ui";

interface RedirectUrisSectionProps {
	redirectUris: string[];
	onUriChange: (index: number, value: string) => void;
	onAddUri: () => void;
	onRemoveUri: (index: number) => void;
	saving: boolean;
	onSubmit: (e: FormEvent) => void;
}

export function RedirectUrisSection({
	redirectUris,
	onUriChange,
	onAddUri,
	onRemoveUri,
	saving,
	onSubmit,
}: RedirectUrisSectionProps) {
	return (
		<Card>
			<h2 className="mb-3 text-lg font-medium">Redirect URIs</h2>
			<form onSubmit={onSubmit} className="space-y-2">
				{redirectUris.map((uri, i) => (
					<div key={i} className="flex gap-2">
						<Input
							type="url"
							value={uri}
							onChange={(e) => onUriChange(i, e.target.value)}
							placeholder="https://..."
							className="flex-1"
						/>
						<IconButton
							type="button"
							variant="danger"
							aria-label="Remove"
							className="p-2"
							onClick={() => onRemoveUri(i)}
						>
							<Trash2 className="h-4 w-4" />
						</IconButton>
					</div>
				))}
				<button
					type="button"
					onClick={onAddUri}
					className="flex items-center gap-1 text-sm text-brand hover:underline"
				>
					<Plus className="h-4 w-4" />
					Add URI
				</button>
				<Button type="submit" disabled={saving} className="mt-2">
					{saving ? "Saving…" : "Save redirect URIs"}
				</Button>
			</form>
		</Card>
	);
}
