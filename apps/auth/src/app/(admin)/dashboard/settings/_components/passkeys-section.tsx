import { Fingerprint, Loader2 } from "lucide-react";
import { Banner, Button, SectionCard } from "@/components/ui";
import { PasskeyListItem, type PasskeyItem } from "./passkey-list-item";

interface PasskeysSectionProps {
	passkeys: PasskeyItem[] | null;
	error: string | null;
	success: string | null;
	pending: boolean;
	onEnroll: () => void;
	renamingId: string | null;
	renameValue: string;
	onRenameValueChange: (value: string) => void;
	savingRenameId: string | null;
	onRename: (pk: PasskeyItem) => void;
	onCancelRename: () => void;
	onStartRename: (pk: PasskeyItem) => void;
	confirmingDeleteId: string | null;
	deletingId: string | null;
	onRequestDelete: (id: string) => void;
	onDelete: (pk: PasskeyItem) => void;
	onCancelDelete: () => void;
	verifyingId: string | null;
	onVerify: (pk: PasskeyItem) => void;
}

export function PasskeysSection({
	passkeys,
	error,
	success,
	pending,
	onEnroll,
	renamingId,
	renameValue,
	onRenameValueChange,
	savingRenameId,
	onRename,
	onCancelRename,
	onStartRename,
	confirmingDeleteId,
	deletingId,
	onRequestDelete,
	onDelete,
	onCancelDelete,
	verifyingId,
	onVerify,
}: PasskeysSectionProps) {
	return (
		<SectionCard title="Passkeys" icon={Fingerprint}>
			<Banner variant="error" message={error} />
			<Banner variant="success" message={success} />
			<p className="mb-4 text-sm text-muted-foreground">
				Passkeys let you sign in without a password. Add one for each device you use.
			</p>
			{passkeys === null ? (
				<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
			) : (
				<div className="space-y-3">
					{passkeys.length === 0 ? (
						<p className="text-sm text-muted-foreground">No passkeys yet.</p>
					) : (
						<ul className="divide-y divide-border overflow-hidden rounded-card border border-border">
							{passkeys.map((pk) => (
								<PasskeyListItem
									key={pk.id}
									passkey={pk}
									isRenaming={renamingId === pk.id}
									renameValue={renameValue}
									onRenameValueChange={onRenameValueChange}
									isSavingRename={savingRenameId === pk.id}
									onRename={() => onRename(pk)}
									onCancelRename={onCancelRename}
									isConfirmingDelete={confirmingDeleteId === pk.id}
									isDeleting={deletingId === pk.id}
									onRequestDelete={() => onRequestDelete(pk.id)}
									onDelete={() => onDelete(pk)}
									onCancelDelete={onCancelDelete}
									isVerifying={verifyingId === pk.id}
									onVerify={() => onVerify(pk)}
									onStartRename={() => onStartRename(pk)}
								/>
							))}
						</ul>
					)}
					<Button
						type="button"
						variant="secondary"
						loading={pending}
						icon={Fingerprint}
						onClick={onEnroll}
					>
						{pending ? "Waiting for device…" : "Add a passkey"}
					</Button>
				</div>
			)}
		</SectionCard>
	);
}
