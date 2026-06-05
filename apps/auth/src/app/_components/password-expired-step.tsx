import Link from "next/link";
import { ArrowLeft, KeyRound } from "lucide-react";
import { Banner } from "@/components/ui";

interface PasswordExpiredStepProps {
	/** Whether a reset link was emailed (false when email delivery isn't configured). */
	emailSent: boolean;
	onBack: () => void;
}

export function PasswordExpiredStep({ emailSent, onBack }: PasswordExpiredStepProps) {
	return (
		<div className="space-y-6">
			<div className="flex items-center gap-3">
				<KeyRound className="h-6 w-6 shrink-0 text-muted-foreground" />
				<h2 className="text-base font-medium text-foreground">Your password has expired</h2>
			</div>
			<Banner
				variant={emailSent ? "info" : "warning"}
				message={
					emailSent
						? "For security, this password is too old and must be reset. We've emailed you a reset link — follow it to choose a new password."
						: "For security, this password is too old and must be reset. Automatic email delivery isn't configured, so please contact an administrator to reset your password."
				}
			/>
			{emailSent ? (
				<p className="text-sm text-muted-foreground">
					Didn&apos;t get the email? You can{" "}
					<Link href="/forgot-password" className="underline hover:text-foreground">
						request another reset link
					</Link>
					.
				</p>
			) : null}
			<button
				type="button"
				onClick={onBack}
				className="flex w-full items-center justify-center gap-2 text-sm text-muted-foreground underline hover:text-foreground"
			>
				<ArrowLeft className="h-4 w-4" />
				Back to sign in
			</button>
		</div>
	);
}
