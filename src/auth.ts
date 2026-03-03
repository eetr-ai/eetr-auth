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
				if (!username || !password) return null;

				const { env } = await getCloudflareContext({ async: true });
				const db = getDb(env);
				const repo = new AdminRepositoryD1(db);
				const admin = await repo.findByUsername(username);
				if (!admin) return null;

				const passwordHash = md5(password);
				if (passwordHash !== admin.passwordHash) return null;

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
			if (isProtected) return isLoggedIn;
			return true;
		},
	},
	pages: {
		signIn: "/login",
	},
});
