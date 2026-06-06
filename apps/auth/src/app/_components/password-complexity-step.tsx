"use client";

import { useState, type FormEvent } from "react";
import { ArrowLeft, Check, Circle, Lock } from "lucide-react";
import { Banner, Button, Input } from "@/components/ui";
import type { PasswordPolicy } from "@/lib/repositories/password-policy.repository";
import {
	listPolicyRequirements,
	validatePasswordAgainstPolicy,
} from "@/lib/auth/password-policy-validation";

interface PasswordComplexityStepProps {
	/** The policy the password failed, for the live requirement checklist. */
	policy: PasswordPolicy;
	username: string;
	email: string | null;
	pending: boolean;
	error: string | null;
	/** Parent persists the new password, then continues the sign-in transparently. */
	onSubmit: (newPassword: string) => void;
	onBack: () => void;
}

export function PasswordComplexityStep({
	policy,
	username,
	email,
	pending,
	error,
	onSubmit,
	onBack,
}: PasswordComplexityStepProps) {
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");

	const requirements = listPolicyRequirements(policy);
	const failedCodes = new Set(
		validatePasswordAgainstPolicy(policy, newPassword, { username, email }).violations.map((v) => v.code)
	);
	const policyUnmet = failedCodes.size > 0;
	const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		if (policyUnmet || mismatch || newPassword.length === 0) return;
		onSubmit(newPassword);
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-6">
			<div className="flex items-center gap-3">
				<Lock className="h-6 w-6 shrink-0 text-muted-foreground" />
				<h2 className="text-base font-medium text-foreground">Update your password</h2>
			</div>
			<Banner
				variant="warning"
				message="Your current password doesn't meet the security policy. Choose a new one to continue signing in."
			/>
			<Banner variant="error" message={error} />

			<div className="space-y-2">
				<label htmlFor="new-password" className="block text-sm font-medium text-foreground">
					New password
				</label>
				<Input
					id="new-password"
					type="password"
					required
					autoComplete="new-password"
					value={newPassword}
					onChange={(e) => setNewPassword(e.target.value)}
					placeholder="Enter new password"
				/>
			</div>
			<div className="space-y-2">
				<label htmlFor="confirm-password" className="block text-sm font-medium text-foreground">
					Confirm new password
				</label>
				<Input
					id="confirm-password"
					type="password"
					required
					autoComplete="new-password"
					value={confirmPassword}
					onChange={(e) => setConfirmPassword(e.target.value)}
					placeholder="Re-enter new password"
				/>
				{mismatch ? <p className="text-sm text-red-600 dark:text-red-400">Passwords don&apos;t match.</p> : null}
			</div>

			{requirements.length > 0 ? (
				<ul className="space-y-1" aria-label="Password requirements">
					{requirements.map((req) => {
						const met = newPassword.length > 0 && !failedCodes.has(req.code);
						return (
							<li
								key={req.code}
								className={`flex items-center gap-2 text-sm ${met ? "text-foreground" : "text-muted-foreground"}`}
							>
								{met ? (
									<Check className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" aria-hidden />
								) : (
									<Circle className="h-3.5 w-3.5 shrink-0" aria-hidden />
								)}
								<span>{req.label}</span>
							</li>
						);
					})}
				</ul>
			) : null}

			<Button
				type="submit"
				disabled={pending || policyUnmet || mismatch || newPassword.length === 0}
				className="w-full focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-background"
			>
				{pending ? "Updating…" : "Update password and continue"}
			</Button>
			<button
				type="button"
				onClick={onBack}
				className="flex w-full items-center justify-center gap-2 text-sm text-muted-foreground underline hover:text-foreground"
			>
				<ArrowLeft className="h-4 w-4" />
				Back to sign in
			</button>
		</form>
	);
}
