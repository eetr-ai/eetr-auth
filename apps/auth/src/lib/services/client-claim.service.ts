import type {
	ClientClaim,
	ClientClaimInput,
	ClientClaimRepository,
	ClientClaimValueType,
} from "@/lib/repositories/client-claim.repository";
import { CLIENT_CLAIM_VALUE_TYPES } from "@/lib/repositories/client-claim.repository";

export interface ClientClaimServiceDependencies {
	clientClaimRepo: ClientClaimRepository;
}

/**
 * Claim names a client may not define, because the token issuer owns them. Overwriting any
 * of these would let a client forge its own identity, audience, lifetime, or scope.
 *
 * The registered JWT claims come from RFC 7519 §4.1; `scope`, `client_id` and `environment`
 * are set by this server when it mints an access token.
 */
export const RESERVED_CLAIM_NAMES: ReadonlySet<string> = new Set([
	"iss",
	"sub",
	"aud",
	"exp",
	"nbf",
	"iat",
	"jti",
	"scope",
	"client_id",
	"environment",
]);

export class ClientClaimValidationError extends Error {}

/** Names must be usable as JSON object keys and readable in a token; keep them strict. */
const CLAIM_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_.:-]*$/;

/**
 * Decode a stored claim value into the JSON type it should carry in the token.
 * Returns `undefined` when the stored value cannot be decoded, so a single malformed row
 * drops that claim rather than failing token issuance for the whole client.
 */
export function decodeClaimValue(
	value: string,
	valueType: ClientClaimValueType
): unknown | undefined {
	switch (valueType) {
		case "string":
			return value;
		case "number": {
			const parsed = Number(value);
			return Number.isFinite(parsed) ? parsed : undefined;
		}
		case "boolean": {
			const normalized = value.trim().toLowerCase();
			if (normalized === "true") return true;
			if (normalized === "false") return false;
			return undefined;
		}
		case "json":
			try {
				return JSON.parse(value);
			} catch {
				return undefined;
			}
	}
}

export class ClientClaimService {
	private readonly clientClaimRepo: ClientClaimRepository;

	constructor({ clientClaimRepo }: ClientClaimServiceDependencies) {
		this.clientClaimRepo = clientClaimRepo;
	}

	async listByClient(clientId: string): Promise<ClientClaim[]> {
		return this.clientClaimRepo.listByClient(clientId);
	}

	/**
	 * Validate and replace a client's claim set.
	 *
	 * Throws {@link ClientClaimValidationError} rather than silently dropping bad input:
	 * an admin who mistyped a claim needs to see it, not discover later that a token is
	 * missing a claim they thought they had configured.
	 */
	async setClientClaims(clientId: string, claims: ClientClaimInput[]): Promise<void> {
		const normalized: ClientClaimInput[] = [];
		const seen = new Set<string>();

		for (const claim of claims) {
			const name = claim.claimName.trim();
			if (!name) continue;

			if (!CLAIM_NAME_PATTERN.test(name)) {
				throw new ClientClaimValidationError(
					`Invalid claim name "${name}". Use letters, digits, and _ . : - , starting with a letter or underscore.`
				);
			}
			if (RESERVED_CLAIM_NAMES.has(name)) {
				throw new ClientClaimValidationError(
					`"${name}" is a reserved claim and cannot be overridden.`
				);
			}
			if (seen.has(name)) {
				throw new ClientClaimValidationError(`Duplicate claim name "${name}".`);
			}
			if (!CLIENT_CLAIM_VALUE_TYPES.includes(claim.valueType)) {
				throw new ClientClaimValidationError(
					`Unknown value type "${claim.valueType}" for claim "${name}".`
				);
			}
			// Validate the value decodes now, so a bad number/boolean/JSON is reported at
			// save time rather than quietly vanishing from every token later.
			if (decodeClaimValue(claim.claimValue, claim.valueType) === undefined) {
				throw new ClientClaimValidationError(
					`Claim "${name}" is not a valid ${claim.valueType}.`
				);
			}

			seen.add(name);
			normalized.push({ claimName: name, claimValue: claim.claimValue, valueType: claim.valueType });
		}

		await this.clientClaimRepo.setClientClaims(clientId, normalized);
	}

	/**
	 * The custom claims to merge into an access token for this client.
	 *
	 * Reserved names are filtered again here, not only at save time: this is what actually
	 * protects a minted token, and it holds even for rows written straight to the database
	 * or by an older version that lacked the write-time check.
	 */
	async getTokenClaims(clientId: string): Promise<Record<string, unknown>> {
		const claims = await this.clientClaimRepo.listByClient(clientId);
		const result: Record<string, unknown> = {};
		for (const claim of claims) {
			if (RESERVED_CLAIM_NAMES.has(claim.claimName)) continue;
			const value = decodeClaimValue(claim.claimValue, claim.valueType);
			if (value === undefined) continue;
			result[claim.claimName] = value;
		}
		return result;
	}
}
