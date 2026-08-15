import { Ban, Trash2 } from "lucide-react";
import { maskToken } from "./format";

export interface TokenActivityItem {
	tokenType: "access" | "refresh";
	tokenId: string;
	clientId: string;
	clientName: string | null;
	environmentId: string;
	expiresAt: string;
	status: "active" | "expired" | "revoked";
	scopeNames: string[];
	createdAt: string | null;
	rotatedFromTokenId: string | null;
}

interface TokenRowProps {
	token: TokenActivityItem;
	actionDisabled: boolean;
	onRevoke: (token: TokenActivityItem) => void;
	onDelete: (token: TokenActivityItem) => void;
}

export function TokenRow({ token, actionDisabled, onRevoke, onDelete }: TokenRowProps) {
	return (
		<tr className="border-b border-border">
			<td className="px-4 py-3 uppercase">{token.tokenType}</td>
			<td className="px-4 py-3 font-mono text-xs">{maskToken(token.tokenId)}</td>
			<td className="px-4 py-3">
				{token.scopeNames.length > 0 ? (
					token.scopeNames.join(" ")
				) : (
					<span className="text-muted-foreground">none</span>
				)}
			</td>
			<td className="px-4 py-3">{token.status}</td>
			<td className="px-4 py-3">
				{token.createdAt ? new Date(token.createdAt).toLocaleString() : "n/a"}
			</td>
			<td className="px-4 py-3">{new Date(token.expiresAt).toLocaleString()}</td>
			<td className="px-4 py-3">
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() => onRevoke(token)}
						disabled={actionDisabled}
						className="inline-flex items-center gap-1 rounded-full border border-warning-border px-2 py-1 text-xs text-warning-fg hover:bg-warning-bg disabled:opacity-50"
					>
						<Ban className="h-3.5 w-3.5" />
						Revoke
					</button>
					<button
						type="button"
						onClick={() => onDelete(token)}
						disabled={actionDisabled}
						className="inline-flex items-center gap-1 rounded-full border border-danger-border px-2 py-1 text-xs text-danger-fg hover:bg-danger-bg disabled:opacity-50"
					>
						<Trash2 className="h-3.5 w-3.5" />
						Delete
					</button>
				</div>
			</td>
		</tr>
	);
}
