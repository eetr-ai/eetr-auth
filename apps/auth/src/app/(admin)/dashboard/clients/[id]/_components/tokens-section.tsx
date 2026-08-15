import { Card } from "@/components/ui";
import { TokenRow, type TokenActivityItem } from "./token-row";

interface TokensSectionProps {
	tokens: TokenActivityItem[];
	tokenActionKey: string | null;
	onRevoke: (token: TokenActivityItem) => void;
	onDelete: (token: TokenActivityItem) => void;
}

export function TokensSection({ tokens, tokenActionKey, onRevoke, onDelete }: TokensSectionProps) {
	return (
		<Card>
			<h2 className="mb-3 text-lg font-medium">Issued Tokens</h2>
			<div className="overflow-x-auto rounded-card border border-border">
				<table className="w-full min-w-[760px] text-left text-sm">
					<thead>
						<tr className="border-b border-border bg-surface-sunken">
							<th className="px-4 py-3 font-medium">Type</th>
							<th className="px-4 py-3 font-medium">Token</th>
							<th className="px-4 py-3 font-medium">Scopes</th>
							<th className="px-4 py-3 font-medium">Status</th>
							<th className="px-4 py-3 font-medium">Created</th>
							<th className="px-4 py-3 font-medium">Expires</th>
							<th className="px-4 py-3 font-medium">Actions</th>
						</tr>
					</thead>
					<tbody>
						{tokens.map((token) => (
							<TokenRow
								key={`${token.tokenType}-${token.tokenId}`}
								token={token}
								actionDisabled={tokenActionKey != null}
								onRevoke={onRevoke}
								onDelete={onDelete}
							/>
						))}
					</tbody>
				</table>
			</div>
			{tokens.length === 0 && (
				<p className="mt-3 text-sm text-muted-foreground">
					No tokens have been issued for this client yet.
				</p>
			)}
		</Card>
	);
}
