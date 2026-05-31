import { BadgeCheck, Check, Fingerprint, Pencil, Trash2, X } from "lucide-react";
import { IconButton, InlineDeleteConfirm, Input } from "@/components/ui";
import { formatDate } from "./format";

/** Safe, display-only passkey summary returned by GET /api/users/passkey. */
export type PasskeyItem = {
	id: string;
	name: string | null;
	synced: boolean;
	deviceBound: boolean;
	createdAt: string;
	lastUsedAt: string | null;
};

interface PasskeyListItemProps {
	passkey: PasskeyItem;
	isRenaming: boolean;
	renameValue: string;
	onRenameValueChange: (value: string) => void;
	isSavingRename: boolean;
	onRename: () => void;
	onCancelRename: () => void;
	isConfirmingDelete: boolean;
	isDeleting: boolean;
	onRequestDelete: () => void;
	onDelete: () => void;
	onCancelDelete: () => void;
	isVerifying: boolean;
	onVerify: () => void;
	onStartRename: () => void;
}

export function PasskeyListItem({
	passkey: pk,
	isRenaming,
	renameValue,
	onRenameValueChange,
	isSavingRename,
	onRename,
	onCancelRename,
	isConfirmingDelete,
	isDeleting,
	onRequestDelete,
	onDelete,
	onCancelDelete,
	isVerifying,
	onVerify,
	onStartRename,
}: PasskeyListItemProps) {
	return (
		<li className="flex items-center gap-3 p-3">
			<Fingerprint className="h-5 w-5 shrink-0 text-muted-foreground" />
			{isRenaming ? (
				<div className="flex flex-1 items-center gap-2">
					<Input
						autoFocus
						value={renameValue}
						onChange={(e) => onRenameValueChange(e.target.value)}
						maxLength={60}
						placeholder="Passkey name"
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								onRename();
							} else if (e.key === "Escape") {
								onCancelRename();
							}
						}}
					/>
					<IconButton
						aria-label="Save name"
						loading={isSavingRename}
						disabled={isSavingRename}
						onClick={onRename}
					>
						<Check className="h-4 w-4" />
					</IconButton>
					<IconButton
						aria-label="Cancel rename"
						disabled={isSavingRename}
						onClick={onCancelRename}
					>
						<X className="h-4 w-4" />
					</IconButton>
				</div>
			) : (
				<>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2">
							<span className="truncate text-sm font-medium">
								{pk.name ?? "Unnamed passkey"}
							</span>
							<span className="shrink-0 rounded-full border border-brand-muted px-2 py-0.5 text-xs text-muted-foreground">
								{pk.synced ? "Synced" : "This device"}
							</span>
						</div>
						<p className="mt-0.5 text-xs text-muted-foreground">
							Added {formatDate(pk.createdAt)} · Last used {formatDate(pk.lastUsedAt)}
						</p>
					</div>
					{isConfirmingDelete ? (
						<InlineDeleteConfirm
							label="Remove?"
							confirmLabel="Remove"
							busy={isDeleting}
							onConfirm={onDelete}
							onCancel={onCancelDelete}
						/>
					) : (
						<div className="flex shrink-0 items-center gap-1">
							<IconButton
								aria-label="Verify passkey on this device"
								title="Verify on this device"
								loading={isVerifying}
								disabled={isVerifying}
								onClick={onVerify}
							>
								<BadgeCheck className="h-4 w-4" />
							</IconButton>
							<IconButton
								aria-label="Rename passkey"
								disabled={isVerifying}
								onClick={onStartRename}
							>
								<Pencil className="h-4 w-4" />
							</IconButton>
							<IconButton
								variant="danger"
								aria-label="Remove passkey"
								disabled={isVerifying}
								onClick={onRequestDelete}
							>
								<Trash2 className="h-4 w-4" />
							</IconButton>
						</div>
					)}
				</>
			)}
		</li>
	);
}
