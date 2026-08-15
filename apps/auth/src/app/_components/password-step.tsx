import type { FormEvent } from "react";
import Link from "next/link";
import { Banner, Button, Input } from "@/components/ui";

interface PasswordStepProps {
	callbackUrl: string;
	username: string;
	onUsernameChange: (value: string) => void;
	password: string;
	onPasswordChange: (value: string) => void;
	error: string | null;
	pending: boolean;
	passkeyPending: boolean;
	mfaEnabled: boolean;
	onSubmit: (e: FormEvent) => void;
	onPasskeySignIn: () => void;
}

export function PasswordStep({
	callbackUrl,
	username,
	onUsernameChange,
	password,
	onPasswordChange,
	error,
	pending,
	passkeyPending,
	mfaEnabled,
	onSubmit,
	onPasskeySignIn,
}: PasswordStepProps) {
	return (
		<form onSubmit={onSubmit} className="space-y-6">
			<input type="hidden" name="callbackUrl" value={callbackUrl} readOnly />
			<div className="space-y-2">
				<label htmlFor="username" className="block text-sm font-medium text-foreground">
					Username
				</label>
				<Input
					id="username"
					name="username"
					type="text"
					required
					autoComplete="username webauthn"
					value={username}
					onChange={(e) => onUsernameChange(e.target.value)}
					placeholder="Enter username"
				/>
			</div>
			<div className="space-y-2">
				<label htmlFor="password" className="block text-sm font-medium text-foreground">
					Password
				</label>
				<Input
					id="password"
					name="password"
					type="password"
					required
					autoComplete="current-password"
					value={password}
					onChange={(e) => onPasswordChange(e.target.value)}
					placeholder="Enter password"
				/>
			</div>
			<Banner variant="error" message={error} />
			<Button
				type="submit"
				disabled={pending}
				className="w-full focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-background"
			>
				{pending ? "Continue…" : mfaEnabled ? "Continue" : "Sign in"}
			</Button>
			<p className="text-center text-sm">
				<Link href="/forgot-password" className="text-muted-foreground underline hover:text-foreground">
					Forgot password?
				</Link>
			</p>
			<div className="relative flex items-center gap-3">
				<hr className="flex-1 border-border/40" />
				<span className="text-xs text-muted-foreground">or</span>
				<hr className="flex-1 border-border/40" />
			</div>
			<Button
				type="button"
				variant="secondary"
				disabled={pending || passkeyPending}
				onClick={onPasskeySignIn}
				className="w-full focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-background"
			>
				{passkeyPending ? "Waiting for passkey…" : "Sign in with passkey"}
			</Button>
		</form>
	);
}
