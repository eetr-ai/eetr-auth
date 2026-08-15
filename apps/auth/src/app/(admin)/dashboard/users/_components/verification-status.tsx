import { BadgeCheck, BadgeX } from "lucide-react";
import type { UserRecord } from "@/lib/repositories/admin.repository";

interface VerificationStatusProps {
	user: UserRecord;
	/** Renders nothing when the user has no email, for use beside a name. */
	hideWhenNoEmail?: boolean;
}

// w-fit: as a flex child these would otherwise stretch to the container's width,
// turning the pill into a full-width bar.
const pill = "inline-flex w-fit shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs";

/** Email verification badge: "No email" / "Verified" / "Unverified". */
export function VerificationStatus({ user, hideWhenNoEmail = false }: VerificationStatusProps) {
	if (!user.email?.trim()) {
		if (hideWhenNoEmail) return null;
		return <span className="text-xs text-muted-foreground">No email</span>;
	}
	if (user.emailVerifiedAt) {
		return (
			<span className={`${pill} bg-success-bg text-success-fg`}>
				<BadgeCheck className="h-3.5 w-3.5" />
				Verified
			</span>
		);
	}
	return (
		<span className={`${pill} bg-warning-bg text-warning-fg`}>
			<BadgeX className="h-3.5 w-3.5" />
			Unverified
		</span>
	);
}
