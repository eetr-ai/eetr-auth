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
										required: ["sub", "email", "preferred_username"],
										properties: {
											sub: { type: "string" },
											name: { type: "string" },
											email: { type: "string", format: "email" },
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
			"/api/users/avatar": {
				post: {
					tags: ["Users"],
					summary: "Upload user avatar",
					description: "Requires authenticated session. Non-admin users may only upload their own avatar.",
					requestBody: {
						required: true,
						content: {
							"multipart/form-data": {
								schema: {
									type: "object",
									required: ["userId", "file"],
									properties: {
										userId: { type: "string" },
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
						"401": { description: "Unauthorized" },
						"403": { description: "Forbidden" },
						"404": { description: "User not found" },
						"500": { description: "Storage not configured" },
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
			},
		},
	};
}