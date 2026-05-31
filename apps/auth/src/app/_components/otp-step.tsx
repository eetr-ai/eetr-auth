import type { FormEvent } from "react";
import { LogOut, Mail, ShieldCheck, Smartphone } from "lucide-react";
import { Banner, Button, Input } from "@/components/ui";

interface OtpStepProps {
	otpPurpose: "mfa" | "email_verification";
	mfaMethod: "totp" | "email";
	mfaMethods: ("totp" | "email")[];
	otp: string;
	onOtpChange: (value: string) => void;
	error: string | null;
	pending: boolean;
	onSubmit: (e: FormEvent) => void;
	onSwitchMethod: (method: "totp" | "email") => void;
	onSignOut: () => void;
}

export function OtpStep({
	otpPurpose,
	mfaMethod,
	mfaMethods,
	otp,
	onOtpChange,
	error,
	pending,
	onSubmit,
	onSwitchMethod,
	onSignOut,
}: OtpStepProps) {
	return (
		<form onSubmit={onSubmit} className="space-y-6">
			<Banner
				variant="info"
				message={
					otpPurpose === "email_verification"
						? "Enter the 6-digit email verification code sent to your email."
						: mfaMethod === "totp"
							? "Enter the 6-digit code from your authenticator app."
							: "Enter the 6-digit sign-in code sent to your email."
				}
			/>
			<div className="space-y-2">
				<label htmlFor="otp" className="block text-sm font-medium text-foreground">
					Verification code
				</label>
				<Input
					id="otp"
					name="otp"
					type="text"
					inputMode="numeric"
					autoComplete="one-time-code"
					pattern="[0-9]{6}"
					maxLength={6}
					required
					value={otp}
					onChange={(e) => onOtpChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
					className="text-center tracking-[0.3em]"
					placeholder="000000"
				/>
			</div>
			<Banner variant="error" message={error} />
			<Button
				type="submit"
				disabled={pending}
				icon={ShieldCheck}
				className="w-full justify-center font-medium focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-background"
			>
				{pending ? "Signing in…" : "Verify and sign in"}
			</Button>
			{otpPurpose === "mfa" && mfaMethods.length > 1 ? (
				<button
					type="button"
					disabled={pending}
					onClick={() => onSwitchMethod(mfaMethod === "totp" ? "email" : "totp")}
					className="flex w-full items-center justify-center gap-2 text-sm text-muted-foreground underline hover:text-foreground"
				>
					{mfaMethod === "totp" ? (
						<>
							<Mail className="h-4 w-4" />
							Use an email code instead
						</>
					) : (
						<>
							<Smartphone className="h-4 w-4" />
							Use your authenticator app
						</>
					)}
				</button>
			) : null}
			<button
				type="button"
				disabled={pending}
				onClick={onSignOut}
				className="flex w-full items-center justify-center gap-2 text-sm text-muted-foreground underline hover:text-foreground"
			>
				<LogOut className="h-4 w-4" />
				Sign out
			</button>
		</form>
	);
}
