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
} as const;

export type AuditAction = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];

/** Resource types referenced by audit-log entries. */
export const AUDIT_RESOURCE = {
	user: "user",
} as const;

export type AuditResource = (typeof AUDIT_RESOURCE)[keyof typeof AUDIT_RESOURCE];
