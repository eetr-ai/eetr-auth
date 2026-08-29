import { useState } from "react";
import { KeyRound, Trash2 } from "lucide-react";
import { IconButton, InlineDeleteConfirm, Spinner } from "@/components/ui";
import type { ConsentWithClient } from "@/lib/repositories/consent.repository";

interface UserConsentsProps {
	consents: ConsentWithClient[];
	loading: boolean;
	/** Row currently being revoked, by client row id. */
	revokingClientId: string | null;
	onRevoke: (clientRowId: string) => void;
}

/**
 * The applications a user has authorized, shown in the user side panel. Rendered as a
 * sibling of the user form rather than inside it: these are immediate actions against the
 * saved user, not fields that participate in the form's submit.
 */
export function UserConsents({
	consents,
	loading,
	revokingClientId,
	onRevoke,
}: UserConsentsProps) {
	// Purely ephemeral UI state, so it stays local.
	const [confirmingClientId, setConfirmingClientId] = useState<string | null>(null);

	return (
		<div className="mt-6 border-t border-border pt-4">
			<div className="mb-2 flex items-center gap-2">
				<KeyRound className="h-4 w-4 text-muted-foreground" />
				<span className="text-sm font-medium">Connected applications</span>
			</div>

			{loading ? (
				<Spinner />
			) : consents.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					This user has not authorized any applications.
				</p>
			) : (
				<ul className="divide-y divide-border overflow-hidden rounded-card border border-border">
					{consents.map((consent) => (
						<li key={consent.clientId} className="px-3 py-2">
							<div className="flex items-center justify-between gap-2">
								<div className="min-w-0">
									<span className="block truncate font-medium">
										{consent.clientName ?? consent.clientIdentifier}
									</span>
									<span className="block truncate font-mono text-xs text-muted-foreground">
										{consent.clientIdentifier}
									</span>
									<div className="mt-1 flex flex-wrap gap-1">
										{consent.scopeNames.map((scope) => (
											<span
												key={scope}
												className="inline-flex items-center rounded-chip bg-surface-sunken px-1.5 py-0.5 font-mono text-xs"
											>
												{scope}
											</span>
										))}
									</div>
								</div>
								{confirmingClientId === consent.clientId ? (
									<InlineDeleteConfirm
										label="Revoke access?"
										confirmLabel="Revoke"
										busy={revokingClientId === consent.clientId}
										onConfirm={() => {
											onRevoke(consent.clientId);
											setConfirmingClientId(null);
										}}
										onCancel={() => setConfirmingClientId(null)}
									/>
								) : (
									<IconButton
										type="button"
										variant="danger"
										aria-label={`Revoke access for ${consent.clientName ?? consent.clientIdentifier}`}
										title="Revoke access"
										disabled={revokingClientId !== null}
										onClick={() => setConfirmingClientId(consent.clientId)}
									>
										<Trash2 className="h-4 w-4" />
									</IconButton>
								)}
							</div>
						</li>
					))}
				</ul>
			)}
			<p className="mt-2 text-xs text-muted-foreground">
				Revoking also signs the user out of that application by revoking its tokens.
			</p>
		</div>
	);
}
