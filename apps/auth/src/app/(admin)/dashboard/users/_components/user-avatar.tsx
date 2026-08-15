import type { UserRecord } from "@/lib/repositories/admin.repository";

interface UserAvatarProps {
	user: UserRecord;
	/** Tailwind size utilities. Defaults to the row size. */
	className?: string;
}

/** Round avatar image, or initials fallback when the user has no picture. */
export function UserAvatar({ user, className = "h-10 w-10" }: UserAvatarProps) {
	// The border and surface fill apply to both variants: without them a picture
	// that fails to load leaves an invisible hole where the avatar should be.
	const base = `${className} shrink-0 rounded-full border border-border bg-surface-sunken`;

	if (user.avatarUrl) {
		return (
			// An <img> rather than a CSS background-image: the URL is built from a
			// stored key, and interpolating it into a `url("…")` string would make
			// any stray quote a way to point at a second image.
			// eslint-disable-next-line @next/next/no-img-element -- remote CDN host, not statically known
			<img
				src={user.avatarUrl}
				alt=""
				className={`${base} object-cover`}
				loading="lazy"
				decoding="async"
			/>
		);
	}
	return (
		<div
			className={`${base} flex items-center justify-center text-xs font-semibold`}
			aria-hidden="true"
		>
			{(user.name ?? user.username).slice(0, 2).toUpperCase()}
		</div>
	);
}
