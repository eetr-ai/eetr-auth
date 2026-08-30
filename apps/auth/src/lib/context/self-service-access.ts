/**
 * Whether a non-admin caller may act on a client's own sub-resources.
 *
 * Pulled out of {@link withAdminApiClientContext} as a pure function because it is the
 * whole security boundary of the self-service mode: every condition below is the reason
 * some escalation is impossible, and each is worth asserting directly.
 */
export type SelfServiceDecision =
	| { allowed: true; userId: string }
	| { allowed: false; description: string };

/**
 * The generic denial. Deliberately identical to the message a caller gets for presenting a
 * plain non-admin token, so probing this endpoint never reveals which clients are
 * configured as admin API clients.
 */
const NOT_ADMIN = "Token client is not configured as an admin API client.";

export function decideSelfServiceAccess(params: {
	/** False when the route did not opt in to self-service at all. */
	enabled: boolean;
	/** clients.id of the client named in the path, or null if it did not resolve. */
	targetClientRowId: string | null;
	/** clients.id of the client the presented token was issued to. */
	tokenClientRowId: string;
	/** The token's `sub`, or null for client_credentials and opaque tokens. */
	subject: string | null;
	/** Set when an API key minted this token. */
	apiKeyId: string | null;
}): SelfServiceDecision {
	if (!params.enabled) {
		return { allowed: false, description: NOT_ADMIN };
	}

	// The token must belong to the very client named in the path. Without this, any client
	// could manage any other client's API keys just by knowing its client_id.
	if (!params.targetClientRowId || params.targetClientRowId !== params.tokenClientRowId) {
		return { allowed: false, description: NOT_ADMIN };
	}

	// There is no user to confine the request to without a subject, and an unconfined
	// non-admin caller is exactly what this mode must not create.
	if (!params.subject) {
		return {
			allowed: false,
			description:
				"A user-scoped JWT access token is required to manage this client's own API keys.",
		};
	}

	// A key must not be able to issue its own successor: one expiring next week and
	// narrowed to `read` could otherwise exchange itself for a token and use it to create a
	// never-expiring key holding every scope the client has, laundering away both limits.
	if (params.apiKeyId) {
		return {
			allowed: false,
			description: "An access token minted from an API key cannot be used to manage API keys.",
		};
	}

	return { allowed: true, userId: params.subject };
}
