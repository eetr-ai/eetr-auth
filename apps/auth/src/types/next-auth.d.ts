import type { DefaultSession } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
	interface Session {
		user: {
			id: string;
			username: string;
			isAdmin: boolean;
		} & DefaultSession["user"];
	}

	interface User {
		username?: string;
		isAdmin?: boolean;
		avatarKey?: string | null;
	}
}

declare module "next-auth/jwt" {
	interface JWT extends DefaultJWT {
		id?: string;
		username?: string;
		isAdmin?: boolean;
		picture?: string | null;
	}
}
