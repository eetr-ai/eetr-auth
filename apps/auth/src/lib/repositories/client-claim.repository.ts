/** How to decode {@link ClientClaim.claimValue} when minting a token. */
export type ClientClaimValueType = "string" | "number" | "boolean" | "json";

export const CLIENT_CLAIM_VALUE_TYPES: readonly ClientClaimValueType[] = [
	"string",
	"number",
	"boolean",
	"json",
] as const;

export interface ClientClaim {
	id: string;
	clientId: string;
	claimName: string;
	/** The raw stored text. Decoded per {@link valueType} at mint time. */
	claimValue: string;
	valueType: ClientClaimValueType;
}

/** A claim without its identity, as supplied by an admin form. */
export interface ClientClaimInput {
	claimName: string;
	claimValue: string;
	valueType: ClientClaimValueType;
}

export interface ClientClaimRepository {
	listByClient(clientId: string): Promise<ClientClaim[]>;
	/** Replace the client's whole claim set, mirroring how client scopes are saved. */
	setClientClaims(clientId: string, claims: ClientClaimInput[]): Promise<void>;
}
