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
import { getAvatarUrl } from "@/lib/users/profile";
import type { RequestContext } from "@/lib/context/types";
import { PasskeyService } from "@/lib/services/passkey.service";
import { getServices } from "@/lib/services/registry";
import { MFA_CHALLENGE_COOKIE } from "@/lib/auth/mfa-cookie";

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
			},
			async authorize(credentials) {
				const username = credentials?.username as string | undefined;
				const password = credentials?.password as string | undefined;
				const otp = (credentials?.otp as string | undefined)?.trim() ?? "";
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
				const mfaEnabled = siteRow?.mfaEnabled ?? false;
				const siteUrl = siteRow?.siteUrl?.trim();
				const mfaActive = mfaEnabled && !!siteUrl;

				if (mfaActive) {
					if (!user.email?.trim()) {
						signInAuthorizeLog({
							outcome: "failure",
							reason: "mfa_enabled_no_user_email",
							userId: user.id,
							username: user.username,
						});
						return null;
					}
					if (!otp) {
						signInAuthorizeLog({
							outcome: "failure",
							reason: "mfa_otp_required_submit_code",
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
							hint: "Call beginMfaSignIn first so the MFA cookie is set",
						});
						return null;
					}
					const requestCtx: RequestContext = { env, cf, ctx };
					const { userChallengeService: challengeSvc } = getServices(requestCtx);
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
				}

				signInAuthorizeLog({
					outcome: "success",
					userId: user.id,
					username: user.username,
					isAdmin: user.isAdmin,
					mfaUsed: mfaActive,
				});
				return {
					id: user.id,
					name: user.name ?? user.username,
					email: user.email,
					image: getAvatarUrl(user.avatarKey, env as unknown as Record<string, unknown>),
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

				const { env, cf, ctx } = await getCloudflareContext({ async: true });
				const requestCtx: RequestContext = { env, cf, ctx };
				const db = getDb(env);
				const repo = new UserRepositoryD1(db);
				const passkeySvc = new PasskeyService({
					repo: new PasskeyRepositoryD1(db),
					userRepo: repo,
					siteRepo: new SiteSettingsRepositoryD1(db),
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
					name: user.name ?? user.username,
					email: user.email,
					image: getAvatarUrl(user.avatarKey, env as unknown as Record<string, unknown>),
					isAdmin: user.isAdmin,
				};
			},
		}),
	],
	session: { strategy: "jwt" },
	callbacks: {
		jwt({ token, user }) {
			if (user) {
				token.id = user.id;
				token.name = user.name;
				token.email = user.email;
				token.picture = user.image;
				token.isAdmin = Boolean((user as { isAdmin?: boolean }).isAdmin);
				console.log("[auth] jwt: user added to token", { id: user.id, name: user.name });
			}
			return token;
		},
		session({ session, token }) {
			if (session.user) {
				session.user.id = token.id as string;
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
