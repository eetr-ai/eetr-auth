/**
 * Max wrong MFA OTP attempts before the challenge row is deleted (`MFA_OTP_MAX_ATTEMPTS`, default 5).
 */
export function resolveMfaOtpMaxAttempts(env?: Record<string, unknown>): number {
	const fromEnv =
		typeof env?.MFA_OTP_MAX_ATTEMPTS === "string" && env.MFA_OTP_MAX_ATTEMPTS.trim().length > 0
			? env.MFA_OTP_MAX_ATTEMPTS.trim()
			: null;
	const fromProcess =
		typeof process.env.MFA_OTP_MAX_ATTEMPTS === "string" &&
		process.env.MFA_OTP_MAX_ATTEMPTS.trim().length > 0
			? process.env.MFA_OTP_MAX_ATTEMPTS.trim()
			: null;
	const raw = fromEnv ?? fromProcess ?? "5";
	const n = Number.parseInt(raw, 10);
	if (!Number.isFinite(n) || n < 1) return 5;
	return n;
}
