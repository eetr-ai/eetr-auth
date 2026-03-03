export type OAuthErrorCode =
	| "invalid_request"
	| "invalid_client"
	| "invalid_grant"
	| "invalid_scope"
	| "unauthorized_client"
	| "unsupported_grant_type"
	| "unsupported_response_type"
	| "access_denied"
	| "server_error";

export class OAuthServiceError extends Error {
	readonly code: OAuthErrorCode;
	readonly status: number;
	readonly redirectUri?: string;
	readonly state?: string;

	constructor(
		code: OAuthErrorCode,
		message: string,
		status: number,
		options?: { redirectUri?: string; state?: string }
	) {
		super(message);
		this.code = code;
		this.status = status;
		this.redirectUri = options?.redirectUri;
		this.state = options?.state;
	}
}

export function isOAuthServiceError(error: unknown): error is OAuthServiceError {
	return error instanceof OAuthServiceError;
}
