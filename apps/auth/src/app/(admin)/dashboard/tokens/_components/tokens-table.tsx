import type { Environment } from "@/lib/repositories/environment.repository";
import { TokenRow } from "./token-row";
import type { TokenActivityItem } from "./types";

interface TokensTableProps {
	tokens: TokenActivityItem[];
	envById: Record<string, Environment>;
	actionInProgress: boolean;
	onRevoke: (token: TokenActivityItem) => void;
	onDelete: (token: TokenActivityItem) => void;
}

export function TokensTable({
	tokens,
	envById,
	actionInProgress,
	onRevoke,
	onDelete,
}: TokensTableProps) {
	return (
		<div className="min-h-0 flex-1 overflow-auto rounded-card border border-border">
			<table className="w-full min-w-[900px] text-left text-sm">
				<thead>
					<tr className="border-b border-border bg-surface-sunken">
						<th className="px-4 py-3 font-medium">Type</th>
						<th className="px-4 py-3 font-medium">Token</th>
						<th className="px-4 py-3 font-medium">Client</th>
						<th className="px-4 py-3 font-medium">Environment</th>
						<th className="px-4 py-3 font-medium">Scopes</th>
						<th className="px-4 py-3 font-medium">Status</th>
						<th className="px-4 py-3 font-medium">Created</th>
						<th className="px-4 py-3 font-medium">Expires</th>
						<th className="px-4 py-3 font-medium">Rotated From</th>
						<th className="px-4 py-3 font-medium">Actions</th>
					</tr>
				</thead>
				<tbody>
					{tokens.map((token) => (
						<TokenRow
							key={`${token.tokenType}-${token.tokenId}`}
							token={token}
							envById={envById}
							actionInProgress={actionInProgress}
							onRevoke={onRevoke}
							onDelete={onDelete}
						/>
					))}
				</tbody>
			</table>
		</div>
	);
}
