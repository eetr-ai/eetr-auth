import type { UserRecord } from "@/lib/repositories/admin.repository";

interface UserAvatarProps {
	user: UserRecord;
}

/** Round avatar image, or initials fallback when the user has no picture. */
export function UserAvatar({ user }: UserAvatarProps) {
	if (user.avatarUrl) {
		return (
			<div
				className="h-10 w-10 rounded-full bg-cover bg-center"
				style={{ backgroundImage: `url("${user.avatarUrl}")` }}
			/>
		);
	}
	return (
		<div className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-xs font-semibold">
			{(user.name ?? user.username).slice(0, 2).toUpperCase()}
		</div>
	);
}
