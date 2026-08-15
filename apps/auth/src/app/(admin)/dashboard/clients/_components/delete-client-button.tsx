import { useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteClient } from "@/app/actions/client-actions";

interface DeleteClientButtonProps {
	clientId: string;
	clientDisplayId: string;
	onDeleted: () => void;
}

export function DeleteClientButton({
	clientId,
	clientDisplayId,
	onDeleted,
}: DeleteClientButtonProps) {
	const [deleting, setDeleting] = useState(false);
	const handleDelete = async () => {
		if (!confirm(`Delete client ${clientDisplayId}? This cannot be undone.`)) return;
		setDeleting(true);
		try {
			await deleteClient(clientId);
			onDeleted();
		} finally {
			setDeleting(false);
		}
	};
	return (
		<button
			type="button"
			onClick={handleDelete}
			disabled={deleting}
			className="flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs text-danger-fg hover:bg-danger-bg disabled:opacity-50"
		>
			<Trash2 className="h-3 w-3" />
			Delete
		</button>
	);
}
