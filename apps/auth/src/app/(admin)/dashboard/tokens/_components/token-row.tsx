import { Ban, RefreshCw, Trash2 } from "lucide-react";
import { IconButton, InlineDeleteConfirm, Td } from "@/components/ui";
import type { Environment } from "@/lib/repositories/environment.repository";
import { DateLine, TokenStatusGlyph, TokenTypeGlyph } from "@/components/tokens/token-glyphs";
import { maskToken, type TokenActivityItem } from "@/components/tokens/types";

/** Which destructive action a row is currently asking to confirm. */
export type TokenAction = "revoke" | "delete";

interface TokenRowProps {
	token: TokenActivityItem;
	envById: Record<string, Environment>;
	actionInProgress: boolean;
	/** The action this row is confirming, or null. */
	confirming: TokenAction | null;
	busy: boolean;
	onRequestAction: (token: TokenActivityItem, action: TokenAction) => void;
	onConfirmAction: (token: TokenActivityItem, action: TokenAction) => void;
	onCancelAction: () => void;
}

export function TokenRow({
	token,
	envById,
	actionInProgress,
	confirming,
	busy,
	onRequestAction,
	onConfirmAction,
	onCancelAction,
}: TokenRowProps) {
	return (
		<tr>
			<Td className="w-px pr-0 align-top">
				<span className="mt-0.5 inline-flex">
					<TokenStatusGlyph status={token.status} />
				</span>
			</Td>

			<Td>
				<div className="flex items-start gap-2">
					<span className="mt-0.5">
						<TokenTypeGlyph type={token.tokenType} />
					</span>
					<div className="min-w-0">
						<div className="font-mono text-xs">{maskToken(token.tokenId)}</div>

						{token.scopeNames.length > 0 ? (
							<div className="mt-1 flex flex-wrap gap-1">
								{token.scopeNames.map((scope) => (
									<span
										key={scope}
										className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs text-muted-foreground"
									>
										{scope}
									</span>
								))}
							</div>
						) : (
							<div className="mt-1 text-xs text-muted-foreground">no scopes</div>
						)}

						{token.rotatedFromTokenId ? (
							// Only shown when it exists — as its own column this was "n/a" on
							// almost every row.
							<div className="mt-1 flex items-center gap-1 font-mono text-xs text-muted-foreground">
								<RefreshCw className="h-3 w-3 shrink-0" aria-hidden />
								<span title="Rotated from">{maskToken(token.rotatedFromTokenId)}</span>
							</div>
						) : null}
					</div>
				</div>
			</Td>

			<Td>
				{/* The client id sits under the name rather than behind a hover tooltip,
				    which was unreachable by keyboard and touch. The environment rides
				    along as a pill, which retires its own column. */}
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<span className="truncate">{token.clientName ?? token.clientId}</span>
						<span className="shrink-0 rounded-full bg-surface-sunken px-2 py-0.5 text-xs text-muted-foreground">
							{envById[token.environmentId]?.name ?? token.environmentId}
						</span>
					</div>
					<div className="truncate font-mono text-xs text-muted-foreground">
						{token.clientId}
					</div>
				</div>
			</Td>

			<Td className="text-xs">
				<div className="flex flex-col gap-1">
					<DateLine kind="created" value={token.createdAt} />
					<DateLine kind="expires" value={token.expiresAt} />
				</div>
			</Td>

			<Td>
				<div className="flex items-center justify-end gap-1">
					{confirming ? (
						<InlineDeleteConfirm
							label={confirming === "revoke" ? "Revoke token?" : "Delete token?"}
							confirmLabel={confirming === "revoke" ? "Revoke" : "Delete"}
							busy={busy}
							onConfirm={() => onConfirmAction(token, confirming)}
							onCancel={onCancelAction}
						/>
					) : (
						<>
							{token.status !== "revoked" ? (
								<IconButton
									type="button"
									aria-label="Revoke token"
									title="Revoke"
									disabled={actionInProgress}
									onClick={() => onRequestAction(token, "revoke")}
								>
									<Ban className="h-4 w-4" />
								</IconButton>
							) : null}
							<IconButton
								type="button"
								variant="danger"
								aria-label="Delete token"
								title="Delete"
								disabled={actionInProgress}
								onClick={() => onRequestAction(token, "delete")}
							>
								<Trash2 className="h-4 w-4" />
							</IconButton>
						</>
					)}
				</div>
			</Td>
		</tr>
	);
}
