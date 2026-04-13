export function getOpenApiDocument(serverUrl?: string) {
	const serverList = serverUrl ? [{ url: serverUrl }] : [];

	return {
		openapi: "3.1.0",
		info: {
			title: "Progression AI Auth API",
			version: "1.0.0",
			description: "OAuth and auth management endpoints exposed under /api.",
		},
		servers: serverList,
		tags: [
			{ name: "Health" },
			{ name: "OAuth" },
			{ name: "Users" },
			{ name: "Admin" },
		],
		paths: {
			"/api/health": {
				get: {
					tags: ["Health"],
					summary: "Service health",
					responses: {
						"200": {
							description: "Health status",
							content: {
								"application/json": {
									schema: {
										type: "object",
										required: ["status", "timestamp"],
										properties: {
											status: { type: "string", example: "ok" },
											timestamp: { type: "string", format: "date-time" },
										},
									},
								},
							},
						},
					},
				},
			},
			"/api/authorize": {
				get: {
					tags: ["OAuth"],
					summary: "Start authorization flow",
					description:
						"Stores pending authorization params in a secure cookie and redirects to login/confirmation.",
					parameters: [
						{ name: "response_type", in: "query", schema: { type: "string" }, required: true },
						{ name: "client_id", in: "query", schema: { type: "string" }, required: true },
						{ name: "redirect_uri", in: "query", schema: { type: "string", format: "uri" }, required: true },
						{ name: "code_challenge", in: "query", schema: { type: "string" }, required: true },
						{
							name: "code_challenge_method",
							in: "query",
							schema: { type: "string", enum: ["S256"] },
							required: true,
						},
						{ name: "scope", in: "query", schema: { type: "string" } },
						{ name: "state", in: "query", schema: { type: "string" } },
					],
					responses: {
						"302": { description: "Redirect to login or confirmation" },
						"303": { description: "Redirect to login or confirmation" },
						"500": {
							description: "Server error",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
					},
				},
				post: {
					tags: ["OAuth"],
					summary: "Authorize and issue code",
					requestBody: {
						required: true,
						content: {
							"application/x-www-form-urlencoded": {
								schema: {
									type: "object",
									required: [
										"response_type",
										"client_id",
										"redirect_uri",
										"code_challenge",
										"code_challenge_method",
									],
									properties: {
										response_type: { type: "string", example: "code" },
										client_id: { type: "string" },
										redirect_uri: { type: "string", format: "uri" },
										code_challenge: { type: "string" },
										code_challenge_method: { type: "string", enum: ["S256"] },
										scope: { type: "string" },
										state: { type: "string" },
									},
								},
							},
						},
					},
					responses: {
						"303": { description: "Redirect to client with authorization code" },
						"400": {
							description: "OAuth validation error",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
						"401": {
							description: "OAuth auth error",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
						"500": {
							description: "Server error",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
					},
				},
			},
			"/api/authorize/complete": {
				get: {
					tags: ["OAuth"],
					summary: "Complete cookie-backed authorization",
					responses: {
						"303": { description: "Redirect to client app or login" },
						"302": { description: "Redirect to error/login page" },
					},
				},
			},
			"/api/token": {
				post: {
					tags: ["OAuth"],
					summary: "OAuth token endpoint",
					description:
						"Supports client_credentials, authorization_code, and refresh_token grants.",
					security: [{ basicAuth: [] }],
					requestBody: {
						required: true,
						content: {
							"application/x-www-form-urlencoded": {
								schema: {
									type: "object",
									required: ["grant_type"],
									properties: {
										grant_type: {
											type: "string",
											enum: ["client_credentials", "authorization_code", "refresh_token"],
										},
										client_id: { type: "string" },
										client_secret: { type: "string" },
										scope: { type: "string" },
										code: { type: "string" },
										redirect_uri: { type: "string", format: "uri" },
										code_verifier: { type: "string" },
										refresh_token: { type: "string" },
									},
								},
							},
						},
					},
					responses: {
						"200": {
							description: "Token response",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/OAuthTokenResponse" },
								},
							},
						},
						"400": {
							description: "Invalid request",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
						"401": {
							description: "Client authentication failed",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
						"500": {
							description: "Server error",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
					},
				},
			},
			"/api/token/validate": {
				post: {
					tags: ["OAuth"],
					summary: "Validate opaque access token",
					description:
						"Pass token via Bearer auth header or request body. environmentName is required.",
					security: [{ bearerAuth: [] }],
					requestBody: {
						required: true,
						content: {
							"application/json": {
								schema: {
									type: "object",
									required: ["environmentName"],
									properties: {
										token: { type: "string" },
										environmentName: { type: "string" },
										scopes: {
											oneOf: [
												{ type: "string", description: "Whitespace-delimited scopes" },
												{ type: "array", items: { type: "string" } },
											],
										},
									},
								},
							},
							"application/x-www-form-urlencoded": {
								schema: {
									type: "object",
									required: ["environmentName"],
									properties: {
										token: { type: "string" },
										environmentName: { type: "string" },
										scopes: { type: "string" },
									},
								},
							},
						},
					},
					responses: {
						"200": {
							description: "Token is valid",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/TokenValidationResponse" },
								},
							},
						},
						"401": {
							description: "Token is invalid or request is incomplete",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/TokenValidationResponse" },
								},
							},
						},
					},
				},
			},
			"/api/userinfo": {
				get: {
					tags: ["OAuth"],
					summary: "OpenID Connect userinfo",
					security: [{ bearerAuth: [] }],
					responses: {
						"200": {
							description: "User profile for token subject",
							content: {
								"application/json": {
									schema: {
										type: "object",
										required: ["sub", "email", "email_verified", "preferred_username"],
										properties: {
											sub: { type: "string" },
											name: { type: "string" },
											email: { type: "string", format: "email" },
											email_verified: { type: "boolean" },
											picture: { type: "string", format: "uri" },
											preferred_username: { type: "string" },
										},
									},
								},
							},
						},
						"401": {
							description: "Invalid or missing access token",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
					},
				},
			},
			"/api/users/email-verification/request": {
				post: {
					tags: ["Users"],
					summary: "Send an email verification code to the authenticated user",
					security: [{ bearerAuth: [] }],
					responses: {
						"200": {
							description: "Request accepted",
							content: {
								"application/json": {
									schema: {
										type: "object",
										required: ["ok"],
										properties: {
											ok: { type: "boolean" },
											challengeId: { type: ["string", "null"] },
										},
									},
								},
							},
						},
						"400": {
							description: "Verification cannot be started for the current user",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
						"401": {
							description: "Invalid or missing access token/session",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
					},
				},
			},
			"/api/users/email-verification/verify": {
				post: {
					tags: ["Users"],
					summary: "Verify the authenticated user's email with an OTP challenge",
					security: [{ bearerAuth: [] }],
					requestBody: {
						required: true,
						content: {
							"application/json": {
								schema: {
									type: "object",
									required: ["challengeId", "code"],
									properties: {
										challengeId: { type: "string" },
										code: { type: "string" },
									},
								},
							},
						},
					},
					responses: {
						"200": {
							description: "Email verified",
							content: {
								"application/json": {
									schema: {
										type: "object",
										required: ["ok"],
										properties: {
											ok: { type: "boolean" },
										},
									},
								},
							},
						},
						"400": {
							description: "Challenge is invalid, expired, or the code does not match",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
						"401": {
							description: "Invalid or missing access token/session",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
					},
				},
			},
			"/api/users/avatar": {
				post: {
					tags: ["Users"],
					summary: "Upload user avatar",
					description:
						"Accepts either an authenticated session or a bearer JWT access token. Session admins may upload avatars for other users. When using a bearer token, the request always targets the token subject; `userId` is optional and ignored if provided.",
					security: [{ bearerAuth: [] }],
					requestBody: {
						required: true,
						content: {
							"multipart/form-data": {
								schema: {
									type: "object",
									required: ["file"],
									properties: {
										userId: {
											type: "string",
											description: "Required for session-authenticated requests unless the caller is updating the current user. Ignored for bearer-token requests.",
										},
										file: { type: "string", format: "binary" },
									},
								},
							},
						},
					},
					responses: {
						"200": {
							description: "Avatar uploaded",
							content: {
								"application/json": {
									schema: {
										type: "object",
										required: ["ok", "avatarKey", "picture"],
										properties: {
											ok: { type: "boolean", example: true },
											avatarKey: { type: "string" },
											picture: { type: "string", format: "uri" },
										},
									},
								},
							},
						},
						"400": {
							description: "Validation error",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
						"401": {
							description: "Missing session or invalid JWT access token",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
						"403": {
							description: "Bearer token subject mismatch or non-admin session user targeting another user",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
						"404": { description: "User not found" },
						"500": { description: "Storage not configured" },
					},
				},
			},
			"/api/users": {
				patch: {
					tags: ["Users"],
					summary: "Update current user profile",
					description:
						"Accepts either an authenticated session or a bearer JWT access token and updates only the current authenticated user. Only `name` and `email` may be changed through this endpoint.",
					security: [{ bearerAuth: [] }],
					requestBody: {
						required: true,
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										name: { type: ["string", "null"] },
										email: { type: ["string", "null"], format: "email" },
									},
									additionalProperties: false,
								},
							},
						},
					},
					responses: {
						"200": {
							description: "Current user updated",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/UserRecord" } },
							},
						},
						"400": {
							description: "Validation error",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
						"401": {
							description: "Missing session or invalid JWT access token",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
						"404": { description: "Authenticated user not found" },
						"409": {
							description: "Email conflict",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
					},
				},
			},
			"/api/admin/users": {
				post: {
					tags: ["Admin"],
					summary: "Create user",
					description:
						"Admin API endpoint. Requires a bearer JWT whose client is configured in Setup > Admin API. This endpoint creates regular users only.",
					security: [{ bearerAuth: [] }],
					requestBody: {
						required: true,
						content: {
							"application/json": {
								schema: {
									type: "object",
									required: ["username", "password"],
									properties: {
										username: { type: "string" },
										password: { type: "string" },
										name: { type: ["string", "null"] },
										email: { type: ["string", "null"], format: "email" },
									},
								},
							},
						},
					},
					responses: {
						"201": {
							description: "User created",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/UserRecord" } },
							},
						},
						"400": {
							description: "Validation error",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
						"401": {
							description: "Invalid token",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
						"403": {
							description: "Token client is not configured as an admin API client",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
						"409": {
							description: "Username or email conflict",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
					},
				},
			},
			"/api/admin/users/{id}": {
				get: {
					tags: ["Admin"],
					summary: "Get user",
					description:
						"Admin API endpoint. Requires a bearer JWT whose client is configured in Setup > Admin API. The `id` path parameter accepts either the internal user UUID or the username.",
					security: [{ bearerAuth: [] }],
					parameters: [
						{
							name: "id",
							in: "path",
							required: true,
							schema: { type: "string" },
							description: "Internal user UUID or username.",
						},
					],
					responses: {
						"200": {
							description: "User found",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/UserRecord" } },
							},
						},
						"400": {
							description: "Missing path parameter",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
						"401": {
							description: "Invalid token",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
						"403": {
							description: "Token client is not configured as an admin API client",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
						"404": {
							description: "User not found",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
					},
				},
				put: {
					tags: ["Admin"],
					summary: "Update user",
					description:
						"Admin API endpoint. Requires a bearer JWT whose client is configured in Setup > Admin API. The `id` path parameter accepts either the internal user UUID or the username.",
					security: [{ bearerAuth: [] }],
					parameters: [
						{
							name: "id",
							in: "path",
							required: true,
							schema: { type: "string" },
							description: "Internal user UUID or username.",
						},
					],
					requestBody: {
						required: true,
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										username: { type: "string" },
										password: { type: "string" },
										isAdmin: { type: "boolean" },
										name: { type: ["string", "null"] },
										email: { type: ["string", "null"], format: "email" },
									},
								},
							},
						},
					},
					responses: {
						"200": {
							description: "User updated",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/UserRecord" } },
							},
						},
						"400": {
							description: "Validation/business-rule error",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
						"401": {
							description: "Invalid token",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
						"403": {
							description: "Token client is not configured as an admin API client",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
						"404": {
							description: "User not found",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
						"409": {
							description: "Username or email conflict",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
					},
				},
				delete: {
					tags: ["Admin"],
					summary: "Delete user",
					description:
						"Admin API endpoint. Requires a bearer JWT whose client is configured in Setup > Admin API. The `id` path parameter accepts either the internal user UUID or the username.",
					security: [{ bearerAuth: [] }],
					parameters: [
						{
							name: "id",
							in: "path",
							required: true,
							schema: { type: "string" },
							description: "Internal user UUID or username.",
						},
					],
					responses: {
						"200": {
							description: "User deleted",
							content: {
								"application/json": {
									schema: {
										type: "object",
										required: ["ok"],
										properties: { ok: { type: "boolean", example: true } },
									},
								},
							},
						},
						"400": {
							description: "Validation/business-rule error",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
						"401": {
							description: "Invalid token",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
						"403": {
							description: "Token client is not configured as an admin API client",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
						"404": {
							description: "User not found",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
					},
				},
			},
			"/api/auth/passkey/challenge": {
				post: {
					tags: ["OAuth"],
					summary: "Create passkey authentication challenge",
					description:
						"Generates a WebAuthn authentication challenge for discoverable-credential sign-in (no username required). Pass the returned `options` to `startAuthentication()` on the client, then submit the response to `/api/auth/passkey/verify`.",
					responses: {
						"200": {
							description: "Authentication challenge created",
							content: {
								"application/json": {
									schema: {
										type: "object",
										required: ["challengeId", "options"],
										properties: {
											challengeId: { type: "string", format: "uuid" },
											options: {
												type: "object",
												description: "PublicKeyCredentialRequestOptionsJSON from @simplewebauthn/types",
											},
										},
									},
								},
							},
						},
						"500": {
							description: "Server error",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
					},
				},
			},
			"/api/auth/passkey/verify": {
				post: {
					tags: ["OAuth"],
					summary: "Verify passkey and obtain exchange token",
					description:
						"Verifies the browser's WebAuthn authentication response. On success returns a short-lived `exchangeToken` (2-minute TTL, single-use) that must be passed to the NextAuth credentials sign-in action to establish a session.",
					requestBody: {
						required: true,
						content: {
							"application/json": {
								schema: {
									type: "object",
									required: ["challengeId", "authenticationResponse"],
									properties: {
										challengeId: { type: "string", format: "uuid" },
										authenticationResponse: {
											type: "object",
											description: "AuthenticationResponseJSON from @simplewebauthn/types",
										},
									},
								},
							},
						},
					},
					responses: {
						"200": {
							description: "Authentication verified — use the exchangeToken to sign in via NextAuth",
							content: {
								"application/json": {
									schema: {
										type: "object",
										required: ["exchangeToken"],
										properties: {
											exchangeToken: { type: "string", format: "uuid" },
										},
									},
								},
							},
						},
						"400": {
							description: "Invalid/expired challenge or verification failed",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
						"500": {
							description: "Server error",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
					},
				},
			},
			"/api/users/passkey/challenge": {
				post: {
					tags: ["Users"],
					summary: "Create passkey registration challenge",
					description:
						"Generates a WebAuthn registration challenge for the authenticated user. Accepts either an authenticated session or a bearer JWT access token. The returned `options` must be passed to `startRegistration()` on the client. The `challengeId` must be submitted with the registration response to `/api/users/passkey/register`.",
					security: [{ bearerAuth: [] }],
					responses: {
						"200": {
							description: "Registration challenge created",
							content: {
								"application/json": {
									schema: {
										type: "object",
										required: ["challengeId", "options"],
										properties: {
											challengeId: { type: "string", format: "uuid" },
											options: {
												type: "object",
												description: "PublicKeyCredentialCreationOptionsJSON from @simplewebauthn/types",
											},
										},
									},
								},
							},
						},
						"401": {
							description: "Missing session or invalid JWT access token",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
						"500": {
							description: "Server error",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
					},
				},
			},
			"/api/users/passkey/register": {
				post: {
					tags: ["Users"],
					summary: "Register a passkey",
					description:
						"Verifies the browser's WebAuthn registration response and stores the passkey credential for the authenticated user. Accepts either an authenticated session or a bearer JWT access token. The `challengeId` must match the one returned by `/api/users/passkey/challenge`.",
					security: [{ bearerAuth: [] }],
					requestBody: {
						required: true,
						content: {
							"application/json": {
								schema: {
									type: "object",
									required: ["challengeId", "registrationResponse"],
									properties: {
										challengeId: { type: "string", format: "uuid" },
										registrationResponse: {
											type: "object",
											description: "RegistrationResponseJSON from @simplewebauthn/types",
										},
									},
								},
							},
						},
					},
					responses: {
						"201": {
							description: "Passkey registered",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/PasskeyCredential" },
								},
							},
						},
						"400": {
							description: "Invalid or expired challenge / verification failed",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
						"401": {
							description: "Missing session or invalid JWT access token",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
						"409": {
							description: "Credential already registered",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
						"500": {
							description: "Server error",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
					},
				},
			},
			"/api/users/passkey/has": {
				get: {
					tags: ["Users"],
					summary: "Check if current user has a passkey",
					description:
						"Returns whether the authenticated user has at least one passkey enrolled. Accepts either an authenticated session or a bearer JWT access token and always evaluates the current authenticated user.",
					security: [{ bearerAuth: [] }],
					responses: {
						"200": {
							description: "Passkey presence check",
							content: {
								"application/json": {
									schema: {
										type: "object",
										required: ["hasPasskey"],
										properties: {
											hasPasskey: { type: "boolean" },
										},
									},
								},
							},
						},
						"401": {
							description: "Missing session or invalid JWT access token",
							content: {
								"application/json": { schema: { $ref: "#/components/schemas/OAuthError" } },
							},
						},
					},
				},
			},
			"/api/admin/site-logo": {
				post: {
					tags: ["Admin"],
					summary: "Upload site logo",
					description: "Admin-only endpoint for site logo uploads.",
					requestBody: {
						required: true,
						content: {
							"multipart/form-data": {
								schema: {
									type: "object",
									required: ["file"],
									properties: {
										file: { type: "string", format: "binary" },
									},
								},
							},
						},
					},
					responses: {
						"200": { description: "Logo uploaded" },
						"400": { description: "Validation error" },
						"403": { description: "Forbidden" },
						"500": { description: "Storage not configured" },
					},
				},
			},
		},
		components: {
			securitySchemes: {
				bearerAuth: {
					type: "http",
					scheme: "bearer",
					bearerFormat: "JWT",
				},
				basicAuth: {
					type: "http",
					scheme: "basic",
				},
			},
			schemas: {
				OAuthError: {
					type: "object",
					required: ["error", "error_description"],
					properties: {
						error: { type: "string" },
						error_description: { type: "string" },
					},
				},
				OAuthTokenResponse: {
					type: "object",
					required: ["access_token", "token_type", "expires_in"],
					properties: {
						access_token: { type: "string" },
						token_type: { type: "string", example: "Bearer" },
						expires_in: { type: "integer" },
						scope: { type: "string" },
						refresh_token: { type: "string" },
					},
				},
				TokenValidationResponse: {
					type: "object",
					required: ["valid", "active", "client_id", "expires_at"],
					properties: {
						valid: { type: "boolean" },
						active: { type: "boolean" },
						client_id: { type: ["string", "null"] },
						expires_at: { type: ["string", "null"], format: "date-time" },
					},
				},
				PasskeyCredential: {
					type: "object",
					required: ["id", "userId", "credentialId", "deviceType", "backedUp", "createdAt"],
					properties: {
						id: { type: "string", format: "uuid" },
						userId: { type: "string" },
						credentialId: { type: "string", description: "base64url-encoded WebAuthn credentialId" },
						deviceType: { type: "string", enum: ["singleDevice", "multiDevice"] },
						backedUp: { type: "boolean" },
						transports: { type: ["string", "null"], description: "JSON array of AuthenticatorTransport values" },
						createdAt: { type: "string", format: "date-time" },
					},
				},
				UserRecord: {
					type: "object",
					required: [
						"id",
						"username",
						"name",
						"email",
						"emailVerifiedAt",
						"avatarKey",
						"isAdmin",
						"avatarUrl",
					],
					properties: {
						id: { type: "string" },
						username: { type: "string" },
						name: { type: ["string", "null"] },
						email: { type: ["string", "null"], format: "email" },
						emailVerifiedAt: { type: ["string", "null"], format: "date-time" },
						avatarKey: { type: ["string", "null"] },
						isAdmin: { type: "boolean" },
						avatarUrl: { type: ["string", "null"], format: "uri" },
					},
				},
			},
		},
	};
}