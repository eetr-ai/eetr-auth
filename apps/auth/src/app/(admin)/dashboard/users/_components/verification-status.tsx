import { BadgeCheck, BadgeX } from "lucide-react";
import type { UserRecord } from "@/lib/repositories/admin.repository";

interface VerificationStatusProps {
	user: UserRecord;
}

/** Email verification badge: "No email" / "Verified" / "Unverified". */
export function VerificationStatus({ user }: VerificationStatusProps) {
	if (!user.email?.trim()) {
		return <span className="text-xs text-muted-foreground">No email</span>;
	}
	if (user.emailVerifiedAt) {
		return (
			<span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2 py-0.5 text-xs text-success-fg">
				<BadgeCheck className="h-3.5 w-3.5" />
				Verified
			</span>
		);
	}
	return (
		<span className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-xs text-warning-fg">
			<BadgeX className="h-3.5 w-3.5" />
			Unverified
		</span>
	);
}
