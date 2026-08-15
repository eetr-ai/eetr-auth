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

export function maskToken(token: string): string {
	if (token.length <= 12) return token;
	return `${token.slice(0, 8)}...${token.slice(-4)}`;
}
