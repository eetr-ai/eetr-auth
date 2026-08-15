import { TBody, THead, Table, Th } from "@/components/ui";
import type { Environment } from "@/lib/repositories/environment.repository";
import { TokenRow, type TokenAction } from "./token-row";
import type { TokenActivityItem } from "./types";

/** Identifies a row across the two token types, whose ids can collide. */
export function tokenKey(token: TokenActivityItem): string {
	return `${token.tokenType}-${token.tokenId}`;
}

interface TokensTableProps {
	tokens: TokenActivityItem[];
	envById: Record<string, Environment>;
	actionInProgress: boolean;
	/** Row key currently asking to confirm, and which action. */
	confirming: { key: string; action: TokenAction } | null;
	busyKey: string | null;
	onRequestAction: (token: TokenActivityItem, action: TokenAction) => void;
	onConfirmAction: (token: TokenActivityItem, action: TokenAction) => void;
	onCancelAction: () => void;
	/** Suppress the client column where every row is the same client. */
	hideClient?: boolean;
	minWidth?: string;
}

export function TokensTable({
	tokens,
	envById,
	actionInProgress,
	confirming,
	busyKey,
	onRequestAction,
	onConfirmAction,
	onCancelAction,
	hideClient = false,
	minWidth = "min-w-[700px]",
}: TokensTableProps) {
	return (
		<div className="min-h-0 flex-1 overflow-auto">
			<Table minWidth={minWidth}>
				<THead>
					{/* Type and scopes ride in the Token cell, client id and environment in
					    the Client cell, and status and both timestamps are glyphs. Ten
					    columns became five. */}
					{/* Status leads as a bare glyph: the column is one icon wide, so a
					    header would be wider than its contents. Named for screen readers. */}
					<Th className="w-px">
						<span className="sr-only">Status</span>
					</Th>
					<Th>Token</Th>
					{hideClient ? null : <Th>Client</Th>}
					<Th>Lifetime</Th>
					<Th className="text-right">Actions</Th>
				</THead>
				<TBody>
					{tokens.map((token) => {
						const key = tokenKey(token);
						return (
							<TokenRow
								key={key}
								token={token}
								envById={envById}
								actionInProgress={actionInProgress}
								confirming={confirming?.key === key ? confirming.action : null}
								busy={busyKey === key}
								onRequestAction={onRequestAction}
								onConfirmAction={onConfirmAction}
								onCancelAction={onCancelAction}
								hideClient={hideClient}
							/>
						);
					})}
				</TBody>
			</Table>
		</div>
	);
}
