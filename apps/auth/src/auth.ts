import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { cookies } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/lib/db";
import { PasskeyRepositoryD1 } from "@/lib/repositories/passkey.repository.d1";
import { UserRepositoryD1 } from "@/lib/repositories/admin.repository.d1";
import { SiteSettingsRepositoryD1 } from "@/lib/repositories/site-settings.repository.d1";
import { verifyPassword } from "@/lib/auth/password-hash";
import { resolveHashMethod } from "@/lib/config/hash-method";
import { resolveAvatarUrl } from "@/lib/users/profile";
import type { RequestContext } from "@/lib/context/types";
import { PasskeyService } from "@/lib/services/passkey.service";
import { getServices } from "@/lib/services/registry";
import { EMAIL_VERIFICATION_CHALLENGE_COOKIE } from "@/lib/auth/email-verification-cookie";
import { isEmailMfaGloballyEnabled } from "@/lib/auth/email-mfa-enablement";
import { MFA_CHALLENGE_COOKIE } from "@/lib/auth/mfa-cookie";
import { refreshAdminClaim } from "@/lib/auth/session-admin-refresh";
import { resolvePendingEnvironmentId } from "@/lib/auth/pending-client";

/** Structured sign-in logs (grep `sign_in_authorize`). Never includes password or OTP. */
function signInAuthorizeLog(payload: Record<string, unknown>) {
	console.info(
		JSON.stringify({
			event: "sign_in_authorize",
			ts: new Date().toISOString(),
			...payload,
		})
	);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
	providers: [
		Credentials({
			credentials: {
				username: { label: "Username", type: "text" },
				password: { label: "Password", type: "password" },
				otp: { label: "One-time code", type: "text" },
				mfaMethod: { label: "MFA method", type: "text" },
			},
			async authorize(credentials) {
				const username = credentials?.username as string | undefined;
				const password = credentials?.password as string | undefined;
				const otp = (credentials?.otp as string | undefined)?.trim() ?? "";
				const mfaMethod = (credentials?.mfaMethod as string | undefined)?.trim() ?? "";
				const usernameNorm = username?.trim() ?? "";
				signInAuthorizeLog({
					outcome: "attempt",
					username: usernameNorm || null,
					hasOtpField: otp.length > 0,
				});
				if (!username || !password) {
					signInAuthorizeLog({
						outcome: "failure",
						reason: "missing_username_or_password",
						username: usernameNorm || null,
						hasPassword: Boolean(password),
					});
					return null;
				}

				const { env, cf, ctx } = await getCloudflareContext({ async: true });
				const envRecord = env as unknown as Record<string, unknown>;
				const hashMethod = resolveHashMethod(envRecord);
				const hasArgonHasher = Boolean(env.ARGON_HASHER);
				const db = getDb(env);
				const repo = new UserRepositoryD1(db);
				const siteRepo = new SiteSettingsRepositoryD1(db);
				const user = await repo.findByUsername(username);
				if (!user) {
					signInAuthorizeLog({
						outcome: "failure",
						reason: "user_not_found",
						username: usernameNorm,
						hashMethod,
						hasArgonHasher,
					});
					return null;
				}

				// A test user is passwordless: its stored hash is the empty sentinel, which
				// verifyPassword already rejects on shape. Refusing before the call makes the
				// intent explicit in the log (rather than a generic password_invalid) and skips
				// a pointless round-trip to the argon-hasher service.
				if (user.isTestUser) {
					signInAuthorizeLog({
						outcome: "failure",
						reason: "test_user_password_disabled",
						userId: user.id,
						username: user.username,
					});
					return null;
				}

				const verified = await verifyPassword(password, user.passwordHash, {
					argonHasher: env.ARGON_HASHER,
					hashMethod,
				});
				if (!verified.ok) {
					signInAuthorizeLog({
						outcome: "failure",
						reason: "password_invalid",
						userId: user.id,
						username: user.username,
						hashMethod,
						hasArgonHasher,
						hint:
							hashMethod === "argon" && !hasArgonHasher
								? "HASH_METHOD=argon requires ARGON_HASHER binding"
								: hashMethod === "md5"
									? "MD5-only verify; Argon2-stored passwords are rejected in md5 mode"
									: undefined,
					});
					return null;
				}
				if (verified.rehash) {
					await repo.update(user.id, { passwordHash: verified.rehash });
				}

				const siteRow = await siteRepo.get();
				// Email MFA and email verification both depend on the global email toggle
				// being on with a Site URL and Resend key configured.
				const emailMfaGloballyEnabled = isEmailMfaGloballyEnabled(siteRow, env.RESEND_API_KEY);
				const emailMfaActive = emailMfaGloballyEnabled && !!user.email?.trim();
				// Email verification is only enforced when email MFA is enabled globally;
				// otherwise there's no way to send a code, so don't block sign-in (including
				// accounts with no email address).
				const requiresEmailVerification =
					emailMfaGloballyEnabled && !user.isAdmin && !user.emailVerifiedAt;

				const requestCtx: RequestContext = { env, cf, ctx };
				const {
						userChallengeService: challengeSvc,
						totpService,
						passwordPolicyService,
						clientService,
					} = getServices(requestCtx);

					// Defense-in-depth: authorize() is the real session issuer and is reachable
					// directly, bypassing beginSignInChallenge. A password that fails the applicable
					// complexity policy must never mint a session. The interactive flow changes the
					// password first, so it never trips this.
					const policyEnvironmentId = await resolvePendingEnvironmentId(
						clientService,
						env as unknown as Record<string, unknown>
					);
					const complexity = await passwordPolicyService.checkSignInPasswordComplexity({
						userId: user.id,
						isAdmin: user.isAdmin,
						environmentId: policyEnvironmentId,
						password,
						identifiers: { username: user.username, email: user.email },
					});
					if (!complexity.ok && complexity.policy) {
						signInAuthorizeLog({
							outcome: "failure",
							reason: "password_complexity_unmet",
							userId: user.id,
							username: user.username,
						});
						return null;
					}
				// TOTP is per-user opt-in: an enrolled authenticator requires MFA even when
				// the site-wide email toggle is off.
				const totpEnrolled = await totpService.isEnrolled(user.id);
				const mfaRequired = totpEnrolled || emailMfaActive;
				let usedMfaMethod: "totp" | "email" | null = null;

				if (mfaRequired) {
					// Use the explicitly chosen method; otherwise fall back to the sole
					// available one (preferring TOTP when both are present).
					const requested = mfaMethod === "totp" || mfaMethod === "email" ? mfaMethod : null;
					const method: "totp" | "email" = requested ?? (totpEnrolled ? "totp" : "email");

					if (!otp) {
						signInAuthorizeLog({
							outcome: "failure",
							reason: "mfa_otp_required_submit_code",
							userId: user.id,
							username: user.username,
							mfaMethod: method,
						});
						return null;
					}

					if (method === "totp") {
						if (!totpEnrolled) {
							signInAuthorizeLog({
								outcome: "failure",
								reason: "mfa_totp_not_enrolled",
								userId: user.id,
								username: user.username,
							});
							return null;
						}
						const totpOk = await totpService.verifyCode(user.id, otp);
						if (!totpOk) {
							signInAuthorizeLog({
								outcome: "failure",
								reason: "mfa_totp_verify_failed",
								userId: user.id,
								username: user.username,
							});
							return null;
						}
						usedMfaMethod = "totp";
						// A TOTP code does not prove email ownership, so it does not satisfy
						// email verification.
					} else {
						if (!emailMfaActive) {
							signInAuthorizeLog({
								outcome: "failure",
								reason: "mfa_email_not_available",
								userId: user.id,
								username: user.username,
							});
							return null;
						}
						const jar = await cookies();
						const challengeId = jar.get(MFA_CHALLENGE_COOKIE)?.value;
						if (!challengeId) {
							signInAuthorizeLog({
								outcome: "failure",
								reason: "mfa_challenge_cookie_missing",
								userId: user.id,
								username: user.username,
								hint: "Call beginSignInChallenge / requestEmailMfaCode first so the MFA cookie is set",
							});
							return null;
						}
						const mfaResult = await challengeSvc.verifyMfaOtpAndConsume(challengeId, user.id, otp);
						if (!mfaResult.ok) {
							signInAuthorizeLog({
								outcome: "failure",
								reason: "mfa_otp_verify_failed",
								mfaFailure: mfaResult.reason,
								userId: user.id,
								username: user.username,
								challengeIdPrefix: challengeId.slice(0, 8),
							});
							return null;
						}
						jar.delete(MFA_CHALLENGE_COOKIE);
						usedMfaMethod = "email";
						// Completing the email OTP also proves email ownership.
						if (requiresEmailVerification) {
							await challengeSvc.markEmailVerified(user.id);
							user.emailVerifiedAt = new Date().toISOString();
						}
					}
				} else if (requiresEmailVerification) {
					if (!user.email?.trim()) {
						signInAuthorizeLog({
							outcome: "failure",
							reason: "email_verification_no_user_email",
							userId: user.id,
							username: user.username,
						});
						return null;
					}
					if (!otp) {
						signInAuthorizeLog({
							outcome: "failure",
							reason: "email_verification_required_submit_code",
							userId: user.id,
							username: user.username,
						});
						return null;
					}
					const jar = await cookies();
					const challengeId = jar.get(EMAIL_VERIFICATION_CHALLENGE_COOKIE)?.value;
					if (!challengeId) {
						signInAuthorizeLog({
							outcome: "failure",
							reason: "email_verification_challenge_cookie_missing",
							userId: user.id,
							username: user.username,
						});
						return null;
					}
					const verificationResult = await challengeSvc.verifyEmailVerificationOtpAndConsume(
						challengeId,
						user.id,
						otp
					);
					if (!verificationResult.ok) {
						signInAuthorizeLog({
							outcome: "failure",
							reason: "email_verification_verify_failed",
							verificationFailure: verificationResult.reason,
							userId: user.id,
							username: user.username,
							challengeIdPrefix: challengeId.slice(0, 8),
						});
						return null;
					}
					jar.delete(EMAIL_VERIFICATION_CHALLENGE_COOKIE);
					user.emailVerifiedAt = new Date().toISOString();
				}

				signInAuthorizeLog({
					outcome: "success",
					userId: user.id,
					username: user.username,
					isAdmin: user.isAdmin,
					mfaUsed: mfaRequired,
					mfaMethod: usedMfaMethod,
				});
				return {
					id: user.id,
					username: user.username,
					name: user.name ?? user.username,
					email: user.email,
					image: resolveAvatarUrl(user.avatarKey, siteRow?.cdnUrl, env as unknown as Record<string, unknown>),
					isAdmin: user.isAdmin,
				};
			},
		}),
		Credentials({
			id: "passkey",
			credentials: {
				exchangeToken: { label: "Exchange Token", type: "text" },
			},
			async authorize(credentials) {
				const exchangeToken = (credentials?.exchangeToken as string | undefined)?.trim() ?? "";
				if (!exchangeToken) return null;

				const { env } = await getCloudflareContext({ async: true });
				const db = getDb(env);
				const repo = new UserRepositoryD1(db);
				const siteRepo = new SiteSettingsRepositoryD1(db);
				const passkeySvc = new PasskeyService({
					repo: new PasskeyRepositoryD1(db),
					userRepo: repo,
					siteRepo,
					env,
				});

				const userId = await passkeySvc.consumeExchangeToken(exchangeToken);
				if (!userId) {
					console.info(
						JSON.stringify({
							event: "sign_in_authorize",
							ts: new Date().toISOString(),
							outcome: "failure",
							provider: "passkey",
							reason: "invalid_or_expired_exchange_token",
						})
					);
					return null;
				}

				const user = await repo.getById(userId);
				if (!user) {
					console.info(
						JSON.stringify({
							event: "sign_in_authorize",
							ts: new Date().toISOString(),
							outcome: "failure",
							provider: "passkey",
							reason: "user_not_found",
							userId,
						})
					);
					return null;
				}
				// A test user has no credentials of its own. A passkey registered against one
				// would be a durable, transferable credential for a passwordless account, so
				// refuse it here as well as at registration time.
				if (user.isTestUser) {
					console.info(
						JSON.stringify({
							event: "sign_in_authorize",
							ts: new Date().toISOString(),
							outcome: "failure",
							provider: "passkey",
							reason: "test_user_passkey_disabled",
							userId,
						})
					);
					return null;
				}
				// Email verification is only enforced when email MFA is enabled globally —
				// otherwise there's no way to verify, so don't block sign-in (mirrors the
				// password provider and beginSignInChallenge).
				const siteRow = await siteRepo.get();
				if (isEmailMfaGloballyEnabled(siteRow, env.RESEND_API_KEY) && !user.isAdmin && !user.emailVerifiedAt) {
					console.info(
						JSON.stringify({
							event: "sign_in_authorize",
							ts: new Date().toISOString(),
							outcome: "failure",
							provider: "passkey",
							reason: "email_unverified",
							userId,
						})
					);
					return null;
				}

				console.info(
					JSON.stringify({
						event: "sign_in_authorize",
						ts: new Date().toISOString(),
						outcome: "success",
						provider: "passkey",
						userId: user.id,
						username: user.username,
						isAdmin: user.isAdmin,
					})
				);

				return {
					id: user.id,
					username: user.username,
					name: user.name ?? user.username,
					email: user.email,
					image: resolveAvatarUrl(user.avatarKey, siteRow?.cdnUrl, env as unknown as Record<string, unknown>),
					isAdmin: user.isAdmin,
				};
			},
		}),
	],
	session: { strategy: "jwt" },
	callbacks: {
		async jwt({ token, user }) {
			if (user) {
				token.id = user.id;
				token.username = (user as { username?: string }).username;
				token.name = user.name;
				token.email = user.email;
				token.picture = user.image;
				token.isAdmin = Boolean((user as { isAdmin?: boolean }).isAdmin);
				token.adminCheckedAt = Date.now();
				console.log("[auth] jwt: user added to token", { id: user.id, name: user.name });
				return token;
			}
			// On subsequent requests the session is JWT-only, so isAdmin would otherwise be
			// frozen at sign-in. Re-derive it from the DB (throttled) so revoking admin — or
			// deleting the user — takes effect without waiting for the session to expire.
			return refreshAdminClaim(token, {
				now: Date.now(),
				fetchIsAdmin: async (userId) => {
					const { env } = await getCloudflareContext({ async: true });
					const repo = new UserRepositoryD1(getDb(env));
					const fresh = await repo.getById(userId);
					return fresh ? Boolean(fresh.isAdmin) : null;
				},
			});
		},
		session({ session, token }) {
			if (session.user) {
				session.user.id = token.id as string;
				session.user.username = (token.username as string) ?? session.user.username;
				session.user.name = (token.name as string) ?? session.user.name;
				session.user.email = (token.email as string | null | undefined) ?? session.user.email;
				session.user.image = (token.picture as string | null | undefined) ?? session.user.image;
				session.user.isAdmin = Boolean(token.isAdmin);
			}
			return session;
		},
		authorized({ auth, request }) {
			const isLoggedIn = !!auth?.user;
			const isAdmin = Boolean(auth?.user && (auth.user as { isAdmin?: boolean }).isAdmin);
			const path = request.nextUrl.pathname;
			const isProtected = path.startsWith("/dashboard") || path.startsWith("/admin");
			if (isProtected) {
				console.log("[auth] authorized:", path, "protected, isLoggedIn:", isLoggedIn, "isAdmin:", isAdmin);
				return isLoggedIn && isAdmin;
			}
			return true;
		},
	},
	pages: {
		signIn: "/",
	},
});
