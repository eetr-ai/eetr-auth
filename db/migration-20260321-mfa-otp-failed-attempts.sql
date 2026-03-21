-- Track failed MFA OTP attempts; row deleted when max exceeded (see MFA_OTP_MAX_ATTEMPTS).
ALTER TABLE user_challenges ADD COLUMN otp_failed_attempts INTEGER NOT NULL DEFAULT 0;
