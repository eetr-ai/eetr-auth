import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/lib/db";
import { AdminRepositoryD1 } from "@/lib/repositories/admin.repository.d1";
import { md5 } from "@/lib/auth/md5";

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
				const repo = new AdminRepositoryD1(db);
				const admin = await repo.findByUsername(username);
				if (!admin) {
					console.log("[auth] authorize: no admin found for username", username);
					return null;
				}

				const passwordHash = md5(password);
				if (passwordHash !== admin.passwordHash) {
					console.log("[auth] authorize: password mismatch for username", username);
					return null;
				}

				console.log("[auth] authorize: success", { id: admin.id, username: admin.username });
				return { id: admin.id, name: admin.username };
			},
		}),
	],
	session: { strategy: "jwt" },
	callbacks: {
		jwt({ token, user }) {
			if (user) {
				token.id = user.id;
				token.name = user.name;
				console.log("[auth] jwt: user added to token", { id: user.id, name: user.name });
			}
			return token;
		},
		session({ session, token }) {
			if (session.user) {
				session.user.id = token.id as string;
				session.user.name = (token.name as string) ?? session.user.name;
			}
			return session;
		},
		authorized({ auth, request }) {
			const isLoggedIn = !!auth?.user;
			const path = request.nextUrl.pathname;
			const isProtected = path.startsWith("/dashboard") || path.startsWith("/admin");
			if (isProtected) {
				console.log("[auth] authorized:", path, "protected, isLoggedIn:", isLoggedIn);
				return isLoggedIn;
			}
			return true;
		},
	},
	pages: {
		signIn: "/",
	},
});
