/**
 * Canonical admin audit-log vocabulary. Single source of truth for the `action`
 * and `resourceType` values written via {@link AdminAuditLogService.logAction}.
 *
 * Keep every audited mutation referencing these constants rather than inline
 * string literals, so the full set of audited actions is discoverable in one
 * place and the strings can't drift between the writer and the audit-log UI.
 */
export const AUDIT_ACTION = {
	userCreate: "user.create",
	userUpdate: "user.update",
	userPasswordChange: "user.password_change",
	userPasswordReset: "user.password_reset",
	userDelete: "user.delete",
	/** Privilege change: a user was granted admin rights. High-value — audited distinctly. */
	userAdminGrant: "user.admin_grant",
	/** Privilege change: a user's admin rights were removed. */
	userAdminRevoke: "user.admin_revoke",

	// Client management
	clientCreate: "client.create",
	clientUpdate: "client.update",
	/** Secret rotation: security-sensitive — audited distinctly from a generic update. */
	clientSecretRotate: "client.secret_rotate",
	clientDelete: "client.delete",

	// Long-lived API keys (per client+user machine credentials)
	apiKeyCreate: "api_key.create",
	/** Revocation is a soft delete: the row survives so this entry still resolves. */
	apiKeyRevoke: "api_key.revoke",

	// Setup: environments
	environmentCreate: "environment.create",
	environmentUpdate: "environment.update",
	environmentDelete: "environment.delete",

	// Setup: scopes
	scopeCreate: "scope.create",
	scopeUpdate: "scope.update",
	scopeDelete: "scope.delete",

	// End-user consent (recorded at /authorize, withdrawn by an admin)
	consentRevoke: "consent.revoke",

	// Setup: password policies
	passwordPolicyCreate: "password_policy.create",
	passwordPolicyUpdate: "password_policy.update",
	passwordPolicyDelete: "password_policy.delete",

	// Setup: site settings
	siteSettingsUpdate: "site_settings.update",
	siteLogoUpdate: "site_settings.logo_update",
	siteAdminApiClientsUpdate: "site_settings.admin_api_clients_update",
} as const;

export type AuditAction = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];

/** Resource types referenced by audit-log entries. */
export const AUDIT_RESOURCE = {
	user: "user",
	client: "client",
	environment: "environment",
	scope: "scope",
	consent: "consent",
	apiKey: "api_key",
	passwordPolicy: "password_policy",
	siteSettings: "site_settings",
} as const;

export type AuditResource = (typeof AUDIT_RESOURCE)[keyof typeof AUDIT_RESOURCE];
