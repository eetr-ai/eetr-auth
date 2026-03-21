import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { cookies } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/lib/db";
import { UserRepositoryD1 } from "@/lib/repositories/admin.repository.d1";
import { SiteSettingsRepositoryD1 } from "@/lib/repositories/site-settings.repository.d1";
import { verifyPassword } from "@/lib/auth/password-hash";
import { resolveHashMethod } from "@/lib/config/hash-method";
import { getAvatarUrl } from "@/lib/users/profile";
import type { RequestContext } from "@/lib/context/types";
import { UserChallengeService } from "@/lib/services/user-challenge.service";
import { MFA_CHALLENGE_COOKIE } from "@/lib/auth/mfa-cookie";

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
				console.log("[auth] authorize: attempt", { username: username ?? "(missing)" });
				if (!username || !password) {
					console.log("[auth] authorize: missing username or password");
					return null;
				}

				const { env, cf, ctx } = await getCloudflareContext({ async: true });
				const db = getDb(env);
				const repo = new UserRepositoryD1(db);
				const siteRepo = new SiteSettingsRepositoryD1(db);
				const user = await repo.findByUsername(username);
				if (!user) {
					console.log("[auth] authorize: no user found for username", username);
					return null;
				}

				const verified = await verifyPassword(password, user.passwordHash, {
					argonHasher: env.ARGON_HASHER,
					hashMethod: resolveHashMethod(env as unknown as Record<string, unknown>),
				});
				if (!verified.ok) {
					console.log("[auth] authorize: password mismatch for username", username);
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
						console.log("[auth] authorize: MFA on but user has no email", user.id);
						return null;
					}
					if (!otp) {
						console.log("[auth] authorize: MFA required but no OTP");
						return null;
					}
					const jar = await cookies();
					const challengeId = jar.get(MFA_CHALLENGE_COOKIE)?.value;
					if (!challengeId) {
						console.log("[auth] authorize: MFA cookie missing");
						return null;
					}
					const requestCtx: RequestContext = { env, cf, ctx };
					const challengeSvc = new UserChallengeService(requestCtx);
					const ok = await challengeSvc.verifyMfaOtpAndConsume(challengeId, user.id, otp);
					if (!ok) {
						console.log("[auth] authorize: invalid MFA code");
						return null;
					}
					jar.delete(MFA_CHALLENGE_COOKIE);
				}

				console.log("[auth] authorize: success", {
					id: user.id,
					username: user.username,
					isAdmin: user.isAdmin,
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
