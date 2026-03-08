import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/lib/db";
import { UserRepositoryD1 } from "@/lib/repositories/admin.repository.d1";
import { md5 } from "@/lib/auth/md5";
import { getAvatarUrl } from "@/lib/users/profile";

export const { handlers, auth, signIn, signOut } = NextAuth({
	providers: [
		Credentials({
			credentials: {
				username: { label: "Username", type: "text" },
				password: { label: "Password", type: "password" },
			},
			async authorize(credentials) {
				const username = credentials?.username as string | undefined;
				const password = credentials?.password as string | undefined;
				console.log("[auth] authorize: attempt", { username: username ?? "(missing)" });
				if (!username || !password) {
					console.log("[auth] authorize: missing username or password");
					return null;
				}

				const { env } = await getCloudflareContext({ async: true });
				const db = getDb(env);
				const repo = new UserRepositoryD1(db);
				const user = await repo.findByUsername(username);
				if (!user) {
					console.log("[auth] authorize: no user found for username", username);
					return null;
				}

				const passwordHash = md5(password);
				const headTail = (s: string) =>
					s.length >= 8 ? `${s.slice(0, 4)}...${s.slice(-4)}` : "(short)";
				console.log("[auth] authorize: MD5 verification", {
					computed: headTail(passwordHash),
					fromDb: headTail(user.passwordHash),
				});
				if (passwordHash !== user.passwordHash) {
					console.log("[auth] authorize: password mismatch for username", username);
					return null;
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
